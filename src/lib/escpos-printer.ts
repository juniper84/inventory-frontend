export type EscPosConnection = {
  type: 'usb' | 'serial';
  write: (data: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
};

type UsbEndpoint = { direction: 'in' | 'out'; endpointNumber: number };
type UsbAlternate = { interfaceClass: number; endpoints: UsbEndpoint[] };
type UsbInterface = { interfaceNumber: number; alternates: UsbAlternate[] };
type UsbConfiguration = { interfaces: UsbInterface[] };
type UsbDevice = {
  configuration?: UsbConfiguration;
  open: () => Promise<void>;
  selectConfiguration: (config: number) => Promise<void>;
  claimInterface: (interfaceNumber: number) => Promise<void>;
  releaseInterface: (interfaceNumber: number) => Promise<void>;
  close: () => Promise<void>;
  transferOut: (endpointNumber: number, data: Uint8Array) => Promise<void>;
};
type USB = {
  requestDevice: (options: { filters: Array<{ classCode?: number }> }) => Promise<UsbDevice>;
};
type SerialWriter = { write: (data: Uint8Array) => Promise<void>; releaseLock: () => void };
type SerialPort = {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  writable?: { getWriter: () => SerialWriter };
};
type Serial = { requestPort: () => Promise<SerialPort> };

const encoder = new TextEncoder();

const ESC = '\x1b';
const GS = '\x1d';
const INIT = `${ESC}@`;
const CUT = `${GS}V\x41\x00`;
const BOLD_ON = `${ESC}E\x01`;
const BOLD_OFF = `${ESC}E\x00`;

export type EscPosLine = {
  text: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
};

const alignCommand = (align?: EscPosLine['align']) => {
  if (!align || align === 'left') {
    return `${ESC}a\x00`;
  }
  if (align === 'center') {
    return `${ESC}a\x01`;
  }
  return `${ESC}a\x02`;
};

export function buildEscPosPayload(lines: EscPosLine[] | string) {
  if (typeof lines === 'string') {
    return encoder.encode(`${INIT}${lines}\n\n${CUT}`);
  }
  const parts: string[] = [INIT];
  let bold = false;
  lines.forEach((line) => {
    parts.push(alignCommand(line.align));
    if (line.bold && !bold) {
      parts.push(BOLD_ON);
      bold = true;
    } else if (!line.bold && bold) {
      parts.push(BOLD_OFF);
      bold = false;
    }
    parts.push(`${line.text}\n`);
  });
  if (bold) {
    parts.push(BOLD_OFF);
  }
  parts.push('\n', CUT);
  return encoder.encode(parts.join(''));
}

export async function connectEscPosPrinter(): Promise<EscPosConnection> {
  if (typeof navigator === 'undefined') {
    throw new Error('Printer connection is only available in the browser.');
  }
  if ('usb' in navigator) {
    const nav = navigator as Navigator & { usb: USB };
    const device = await nav.usb.requestDevice({
      filters: [{ classCode: 7 }],
    });
    await device.open();
    if (!device.configuration) {
      await device.selectConfiguration(1);
    }
    const configuration = device.configuration;
    if (!configuration) {
      throw new Error('No USB configuration available.');
    }
    const printerInterface = configuration.interfaces.find((iface: UsbInterface) =>
      iface.alternates.some((alt: UsbAlternate) => alt.interfaceClass === 7),
    );
    if (!printerInterface) {
      throw new Error('No USB printer interface found.');
    }
    const alternate = printerInterface.alternates.find(
      (alt: UsbAlternate) => alt.interfaceClass === 7,
    );
    if (!alternate) {
      throw new Error('No USB printer interface available.');
    }
    await device.claimInterface(printerInterface.interfaceNumber);
    const endpoint = alternate.endpoints.find(
      (entry: UsbEndpoint) => entry.direction === 'out',
    );
    if (!endpoint) {
      throw new Error('No USB OUT endpoint available.');
    }
    return {
      type: 'usb',
      write: async (data) => {
        await device.transferOut(endpoint.endpointNumber, data);
      },
      close: async () => {
        try {
          await device.releaseInterface(printerInterface.interfaceNumber);
        } finally {
          await device.close();
        }
      },
    };
  }
  if ('serial' in navigator) {
    const nav = navigator as Navigator & { serial: Serial };
    const port = await nav.serial.requestPort();
    await port.open({ baudRate: 9600 });
    const writer = port.writable?.getWriter();
    if (!writer) {
      throw new Error('Serial writer not available.');
    }
    return {
      type: 'serial',
      write: async (data) => {
        await writer.write(data);
      },
      close: async () => {
        writer.releaseLock();
        await port.close();
      },
    };
  }
  throw new Error('USB/Serial printing is not supported by this browser.');
}

export async function printEscPosText(
  connection: EscPosConnection,
  text: string,
) {
  const payload = buildEscPosPayload(text);
  await connection.write(payload);
}

export async function printEscPosLines(
  connection: EscPosConnection,
  lines: EscPosLine[],
) {
  const payload = buildEscPosPayload(lines);
  await connection.write(payload);
}
