import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Under Maintenance — New Vision Inventory',
};

function formatWindow(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-TZ', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Africa/Dar_es_Salaam',
    });
  } catch {
    return iso;
  }
}

export default function MaintenancePage() {
  const endIso = process.env.NEXT_PUBLIC_MAINTENANCE_END ?? '';
  const endFormatted = endIso ? formatWindow(endIso) : null;

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{
        background: [
          'radial-gradient(900px 700px at 14% 10%, rgba(246,211,122,.10), transparent 55%)',
          'radial-gradient(800px 600px at 90% 5%, rgba(100,217,209,.07), transparent 50%)',
          'linear-gradient(180deg, #060609, #0b0b10)',
        ].join(', '),
      }}
    >
      {/* Logo */}
      <div className="mb-10">
        <Image
          src="/logo-email.png"
          alt="New Vision Inventory"
          width={180}
          height={60}
          priority
          className="object-contain"
          style={{ filter: 'brightness(1.1)' }}
        />
      </div>

      {/* Icon */}
      <div className="mb-6 flex items-center justify-center w-16 h-16 rounded-full bg-gold-500/10 border border-gold-500/30">
        <svg
          className="w-8 h-8 text-gold-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
          />
        </svg>
      </div>

      {/* English */}
      <div className="text-center mb-8 max-w-lg">
        <h1 className="text-2xl font-semibold text-white mb-3">
          System Under Maintenance
        </h1>
        <p className="text-white/60 text-sm leading-relaxed">
          We are currently performing scheduled maintenance to improve your
          experience. The system will be back online shortly.
        </p>
        {endFormatted && (
          <p className="mt-3 text-sm text-gold-400/90">
            Expected back by:{' '}
            <span className="font-medium text-gold-300">{endFormatted}</span>
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-white/10 mb-8" />

      {/* Swahili */}
      <div className="text-center max-w-lg">
        <h2 className="text-xl font-semibold text-white mb-3">
          Mfumo Unahudumiwa
        </h2>
        <p className="text-white/60 text-sm leading-relaxed">
          Kwa sasa tunafanya matengenezo ya kawaida ili kuboresha huduma yenu.
          Mfumo utarudi mtandaoni hivi karibuni.
        </p>
        {endFormatted && (
          <p className="mt-3 text-sm text-gold-400/90">
            Inatarajiwa kurudi:{' '}
            <span className="font-medium text-gold-300">{endFormatted}</span>
          </p>
        )}
      </div>

      {/* Footer */}
      <p className="mt-16 text-xs text-white/25">
        © {new Date().getFullYear()} New Vision Inventory. All rights reserved.
      </p>
    </main>
  );
}
