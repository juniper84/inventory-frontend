export type ErrorLocale = 'en' | 'sw';

type ErrorMessageTable = Record<string, string>;

export const API_ERROR_MESSAGES: Record<ErrorLocale, ErrorMessageTable> = {
  en: {
    ADMIN_IS_NOT_ACTIVE: 'Admin is not active.',
    APPROVAL_NOT_FOUND: 'Approval not found.',
    APPROVAL_REFERENCE_MISSING: 'Approval reference missing.',
    APPROVAL_SYNC_IS_NOT_APPLICABLE: 'Approval sync is not applicable.',
    ATTACHMENT_EXCEEDS_20MB_LIMIT: 'Attachment exceeds 20MB limit.',
    AUDIT_EXPORT_REQUIRES_ACKNOWLEDGEMENT: 'Audit export requires acknowledgement.',
    BASEUNITID_AND_SELLUNITID_ARE_REQUIRED: 'baseUnitId and sellUnitId are required.',
    BRANCH_SCOPE_RESTRICTION: 'Branch scope restriction.',
    BRANCH_SCOPED_EXPORT_TYPE_NOT_ALLOWED: 'Branch-scoped export type not allowed.',
    BRANCH_SCOPED_EXPORTS_REQUIRE_A_BRANCH: 'Branch-scoped exports require a branch.',
    BRANCH_SCOPED_ROLE_RESTRICTION: 'Branch-scoped role restriction.',
    BUSINESS_CONTEXT_REQUIRED: 'Business context required.',
    BUSINESS_ID_CONFIRMATION_DOES_NOT_MATCH: 'Business ID confirmation does not match.',
    BUSINESS_IS_IN_READ_ONLY_MODE: 'Business is in read-only mode.',
    BUSINESS_IS_NOT_ACTIVE: 'Business is not active.',
    BUSINESS_MUST_BE_ARCHIVED_BEFORE_PURGE: 'Business must be archived before purge.',
    BUSINESS_NOT_FOUND: 'Business not found.',
    CANNOT_ADD_REMINDERS_TO_ARCHIVED_NOTES: 'Cannot add reminders to archived notes.',
    CATEGORYID_IS_REQUIRED: 'categoryId is required.',
    CONFIRMATION_TEXT_DOES_NOT_MATCH: 'Confirmation text does not match.',
    CONVERSION_FACTOR_IS_REQUIRED: 'Conversion factor is required.',
    COUNTEDQUANTITY_IS_REQUIRED: 'countedQuantity is required.',
    CREDIT_SALES_ARE_DISABLED: 'Credit sales are disabled.',
    CREDIT_SALES_REQUIRE_PERMISSION: 'Credit sales require permission.',
    CSV_MUST_INCLUDE_HEADERS: 'CSV must include headers.',
    CURRENT_PASSWORD_IS_INCORRECT: 'Current password is incorrect.',
    DEFAULT_UNIT_NOT_CONFIGURED: 'Default unit not configured.',
    DEVICE_ID_REQUIRED: 'Device ID required.',
    DEVICE_NOT_FOUND: 'Device not found.',
    DEVICE_NOT_REGISTERED_FOR_THIS_USER: 'Device not registered for this user.',
    EMAIL_IS_NOT_VERIFIED: 'Email is not verified.',
    EXPENSES_ARE_NOT_ALLOWED_IN_OFFLINE_MODE: 'Expenses are not allowed in offline mode.',
    EXPORT_JOB_NOT_FOUND: 'Export job not found.',
    EXPORTS_HTTP_ERROR: 'HTTP {details}',
    IMAGE_EXCEEDS_20MB_LIMIT: 'Image exceeds 20MB limit.',
    IMPORT_MISSING_HEADERS: 'Missing headers: {details}',
    INSUFFICIENT_STOCK_FOR_SALE: 'Insufficient stock for sale.',
    INVALID_ACCESS_TOKEN: 'Invalid access token.',
    INVALID_CREDENTIALS: 'Invalid credentials.',
    INVALID_EXPENSE_CATEGORY: 'Invalid expense category.',
    INVALID_REFUND_QUANTITY: 'Invalid refund quantity.',
    INVALID_REMINDER_DATE: 'Invalid reminder date.',
    INVALID_STOCK_ADJUSTMENT_PAYLOAD: 'Invalid stock adjustment payload.',
    INVALID_STOCK_COUNT_PAYLOAD: 'Invalid stock count payload.',
    INVALID_SUPPORT_ACCESS_TOKEN: 'Invalid support access token.',
    ITEM_QUANTITY_MUST_BE_A_NUMBER: 'item quantity must be a number.',
    ITEMS_ARE_REQUIRED: 'items are required.',
    LINES_ARE_REQUIRED: 'lines are required.',
    LINK_REQUIRES_RESOURCE_TYPE_AND_ID: 'Link requires resource type and id.',
    MISSING_ACCESS_TOKEN: 'Missing access token.',
    MISSING_NOTIFICATIONS_PERMISSION: 'Missing notifications permission.',
    MISSING_REQUIRED_SIGNUP_FIELDS: 'Missing required signup fields.',
    MULTIPLE_VARIANTS_MATCHED_THIS_BARCODE: 'Multiple variants matched this barcode.',
    NAME_IS_REQUIRED: 'name is required.',
    NOTES_UNKNOWN_RESOURCE: 'Unknown resource for {details}',
    NOTES_UNSUPPORTED_LINK_TYPE: 'Unsupported link type: {details}',
    NOT_ALLOWED_TO_ARCHIVE_THIS_NOTE: 'Not allowed to archive this note.',
    NOT_ALLOWED_TO_CANCEL_THIS_REMINDER: 'Not allowed to cancel this reminder.',
    NOT_ALLOWED_TO_EDIT_THIS_NOTE: 'Not allowed to edit this note.',
    NOT_ALLOWED_TO_VIEW_REMINDERS: 'Not allowed to view reminders.',
    OFFLINE_ACTION_NOT_FOUND: 'Offline action not found.',
    OFFLINE_DEVICE_ID_IS_REQUIRED: 'Offline device ID is required.',
    OFFLINE_DEVICE_IS_NOT_ACTIVE: 'Offline device is not active.',
    OFFLINE_DEVICE_IS_NOT_REGISTERED: 'Offline device is not registered.',
    OFFLINE_SALE_EXCEEDS_MAX_TOTAL_VALUE: 'Offline sale exceeds max total value.',
    OFFLINE_SALE_OWNER_MISMATCH: 'Offline sale owner mismatch.',
    OFFLINE_SALE_QUEUE_LIMIT_REACHED: 'Offline sale queue limit reached.',
    OFFLINE_SALES_ARE_NOT_ENABLED: 'Offline sales are not enabled.',
    OFFLINE_SESSION_DURATION_EXCEEDED: 'Offline session duration exceeded.',
    ONLY_COMPLETED_SALES_CAN_BE_REFUNDED: 'Only completed sales can be refunded.',
    ONLY_DRAFT_SALES_CAN_BE_VOIDED: 'Only draft sales can be voided.',
    PASSWORD_DOES_NOT_MEET_REQUIREMENTS: 'Password does not meet requirements.',
    PAYMENT_METHOD_REQUIRED: 'Payment method required.',
    PAYMENTS_CANNOT_EXCEED_SALE_TOTAL: 'Payments cannot exceed sale total.',
    PRICE_OVERRIDE_IS_ONLY_AVAILABLE_FOR_SALES: 'Price override is only available for sales.',
    PRIMARY_IMAGE_IS_REQUIRED: 'Primary image is required.',
    PRISMA_DELETE_DISABLED: 'Deletes are disabled for {details}.',
    PURCHASE_ORDER_LINES_ARE_REQUIRED: 'Purchase order lines are required.',
    REASON_IS_REQUIRED: 'reason is required.',
    REASON_IS_REQUIRED_FOR_SKU_REASSIGNMENT: 'Reason is required for SKU reassignment.',
    RECEIVING_IS_NOT_ALLOWED_IN_OFFLINE_MODE: 'Receiving is not allowed in offline mode.',
    RECEIVING_LINE_NOT_FOUND: 'Receiving line not found.',
    REFRESH_TOKEN_DEVICE_MISMATCH: 'Refresh token device mismatch.',
    REFRESH_TOKEN_EXPIRED: 'Refresh token expired.',
    REFRESH_TOKEN_REUSE_DETECTED: 'Refresh token reuse detected.',
    REQUEST_ALREADY_RESOLVED: 'Request already resolved.',
    REQUEST_EXPIRED: 'Request expired.',
    REQUEST_IS_NOT_APPROVED: 'Request is not approved.',
    REQUEST_NOT_FOUND: 'Request not found.',
    REQUESTED_TIER_IS_REQUIRED: 'Requested tier is required.',
    RESET_TOKEN_EXPIRED: 'Reset token expired.',
    RETURN_MUST_INCLUDE_AT_LEAST_ONE_ITEM: 'Return must include at least one item.',
    S3_BUCKET_NOT_CONFIGURED: 'S3 bucket not configured.',
    SALE_COMPLETION_FAILED: 'Sale completion failed.',
    SALE_LINE_NOT_FOUND_FOR_REFUND: 'Sale line not found for refund.',
    SALE_MUST_CONTAIN_AT_LEAST_ONE_LINE: 'Sale must contain at least one line.',
    SALEID_IS_REQUIRED: 'saleId is required.',
    SETTLEMENT_AMOUNT_MUST_BE_POSITIVE: 'Settlement amount must be positive.',
    SETTLEMENT_EXCEEDS_OUTSTANDING_BALANCE: 'Settlement exceeds outstanding balance.',
    SMS_SEND_FAILED: 'Infobip SMS send failed: {details}',
    STOCK_SERVICE_UNAVAILABLE_FOR_APPROVAL: 'Stock service unavailable for approval.',
    STORAGE_LIMIT_EXCEEDED: 'Storage limit exceeded.',
    SUBSCRIPTION_ALREADY_EXISTS: 'Subscription already exists.',
    SUBSCRIPTION_NOT_FOUND: 'Subscription not found.',
    SUBSCRIPTION_REQUEST_ALREADY_RESOLVED: 'Subscription request already resolved.',
    SUBSCRIPTION_REQUEST_NOT_FOUND: 'Subscription request not found.',
    SUPPLIER_IS_INACTIVE: 'Supplier is inactive.',
    SUPPORT_ACCESS_IS_READ_ONLY: 'Support access is read-only.',
    SYSTEM_OWNER_ROLE_MISSING: 'System Owner role missing.',
    TITLE_AND_BODY_ARE_REQUIRED: 'Title and body are required.',
    TYPE_AND_CSV_ARE_REQUIRED: 'type and csv are required.',
    TYPE_IS_REQUIRED: 'type is required.',
    UNIT_CODE_ALREADY_EXISTS: 'Unit code already exists.',
    UNIT_CODE_MUST_BE_ALPHANUMERIC: 'Unit code must be alphanumeric.',
    UNIT_LABEL_IS_REQUIRED: 'Unit label is required.',
    UNIT_NOT_FOUND: 'Unit not found.',
    UNIT_PRICE_BELOW_MINIMUM_ALLOWED: 'Unit price below minimum allowed.',
    UNIT_PRICE_REQUIRED_FOR_SALE_LINE: 'Unit price required for sale line.',
    UNSUPPORTED_EXPORT_TYPE: 'Unsupported export type.',
    UNSUPPORTED_IMPORT_TYPE: 'Unsupported import type.',
    UNSUPPORTED_UNIT_FOR_THIS_VARIANT: 'Unsupported unit for this variant.',
    USER_IS_NOT_ACTIVE: 'User is not active.',
    USER_IS_NOT_ACTIVE_FOR_ANY_BUSINESS: 'User is not active for any business.',
    USER_IS_NOT_ACTIVE_FOR_THIS_BUSINESS: 'User is not active for this business.',
    USER_NOT_ACTIVE_FOR_THIS_BUSINESS: 'User not active for this business.',
    USER_NOT_FOUND: 'User not found.',
    VARIANT_IS_INACTIVE_OR_ARCHIVED: 'Variant is inactive or archived.',
    VARIANT_IS_NOT_AVAILABLE_AT_THIS_BRANCH:
      'Variant is not available at this branch.',
    VARIANT_NOT_FOUND: 'Variant not found.',
    VARIANT_NOT_ON_PURCHASE_ORDER: 'Variant not on purchase order.',
    VARIANTID_IS_REQUIRED: 'variantId is required.',
    VERIFICATION_TOKEN_EXPIRED: 'Verification token expired.',
    A_PENDING_SUBSCRIPTION_REQUEST_ALREADY_EXISTS:
      'A pending subscription request already exists.',
    ADDITIONAL_IMAGES_ARE_NOT_ENABLED_FOR_THIS_SUBSCRIPTION:
      'Additional images are not enabled for this subscription.',
    AN_OPEN_SHIFT_IS_REQUIRED_FOR_POS_SALES:
      'An open shift is required for POS sales.',
    AT_LEAST_ONE_REMINDER_CHANNEL_IS_REQUIRED:
      'At least one reminder channel is required.',
    AT_LEAST_ONE_BRANCH_IS_REQUIRED_BEFORE_COMPLETING_ONBOARDING:
      'At least one branch is required before completing onboarding.',
    ATTACHMENT_TYPE_MUST_BE_JPG_PNG_OR_PDF:
      'Attachment type must be JPG, PNG, or PDF.',
    BATCH_CODE_IS_REQUIRED_FOR_RECEIVING:
      'Batch code is required for receiving.',
    BATCH_NOT_FOUND_FOR_RECEIVING_LINE:
      'Batch not found for receiving line.',
    BATCH_NOT_FOUND_FOR_SALE_LINE: 'Batch not found for sale line.',
    BATCH_SELECTION_REQUIRES_STOCK_PERMISSION:
      'Batch selection requires stock permission.',
    BRANCH_IS_REQUIRED_FOR_BATCH_TRACKING:
      'Branch is required for batch tracking.',
    BRANCH_IS_REQUIRED_FOR_BRANCH_VISIBLE_NOTES:
      'Branch is required for branch-visible notes.',
    BRANCH_SCOPED_EXPORTS_REQUIRE_A_VALID_BRANCH:
      'Branch-scoped exports require a valid branch.',
    BUSINESS_CHANGED_SINCE_LAST_READ_REFRESH_AND_RETRY:
      'Business changed since last read. Refresh and retry.',
    DUPLICATE_IDEMPOTENCY_KEY: 'Duplicate idempotency key.',
    DURATION_DAYS_MUST_BE_GREATER_THAN_ZERO:
      'Duration days must be greater than zero.',
    INCIDENT_NOT_FOUND: 'Incident not found.',
    INSUFFICIENT_STOCK_FOR_SUPPLIER_RETURN:
      'Insufficient stock for supplier return.',
    INVALID_START_DATE: 'Invalid start date.',
    MANUAL_SUPPLIER_RETURNS_REQUIRE_A_REASON:
      'Manual supplier returns require a reason.',
    MINQUANTITY_AND_REORDERQUANTITY_ARE_REQUIRED:
      'minQuantity and reorderQuantity are required.',
    NO_BATCH_AVAILABLE_FOR_SALE_LINE: 'No batch available for sale line.',
    NOTE_IS_REQUIRED: 'Note is required.',
    OFFLINE_DEVICE_IS_MISSING_FOR_THIS_SALE:
      'Offline device is missing for this sale.',
    OFFLINE_MODE_IS_DISABLED_FOR_THIS_SUBSCRIPTION:
      'Offline mode is disabled for this subscription.',
    OFFLINE_MODE_NOT_ENABLED_FOR_THIS_SUBSCRIPTION:
      'Offline mode not enabled for this subscription.',
    OFFLINE_SALE_QUEUE_EXCEEDS_MAXIMUM_ALLOWED:
      'Offline sale queue exceeds maximum allowed.',
    OFFLINE_SALE_TOTAL_EXCEEDS_MAXIMUM_ALLOWED:
      'Offline sale total exceeds maximum allowed.',
    ONLY_FAILED_EXPORT_JOBS_CAN_BE_RETRIED:
      'Only FAILED export jobs can be retried.',
    ONLY_PENDING_EXPORT_JOBS_CAN_BE_CANCELED:
      'Only PENDING export jobs can be canceled.',
    ONLY_THE_SYSTEM_OWNER_CAN_DELETE_A_BUSINESS:
      'Only the System Owner can delete a business.',
    PERMISSION_IS_REQUIRED: 'permission is required.',
    PURCHASE_ORDER_HAS_DUPLICATE_VARIANT_LINES:
      'Purchase order has duplicate variant lines.',
    PURCHASE_ORDER_NOT_APPROVED_FOR_RECEIVING:
      'Purchase order not approved for receiving.',
    PURCHASEID_OR_PURCHASEORDERID_IS_REQUIRED:
      'purchaseId or purchaseOrderId is required.',
    REASON_IS_REQUIRED_FOR_BARCODE_REASSIGNMENT:
      'Reason is required for barcode reassignment.',
    RECEIVING_LINE_DOES_NOT_MATCH_RETURN_SOURCE:
      'Receiving line does not match return source.',
    RECEIVING_MUST_INCLUDE_AT_LEAST_ONE_LINE:
      'Receiving must include at least one line.',
    RECEIVING_OVERRIDE_REQUIRES_A_REASON:
      'Receiving override requires a reason.',
    REMINDER_CHANNEL_NOT_AVAILABLE_FOR_THIS_TIER:
      'Reminder channel not available for this tier.',
    REMOVING_PURCHASE_ORDER_LINES_IS_NOT_ALLOWED:
      'Removing purchase order lines is not allowed.',
    RUNNING_EXPORT_JOBS_CANNOT_BE_REQUEUED:
      'RUNNING export jobs cannot be requeued.',
    SESSION_NOT_FOUND: 'Session not found.',
    STOCK_COUNTS_ARE_NOT_ALLOWED_IN_OFFLINE_MODE:
      'Stock counts are not allowed in offline mode.',
    SYSTEM_OWNER_PERMISSIONS_ARE_LOCKED:
      'System Owner permissions are locked.',
    TRANSFERS_ARE_NOT_ALLOWED_IN_OFFLINE_MODE:
      'Transfers are not allowed in offline mode.',
    UNKNOWN_PERMISSION: 'Unknown permission.',
    USER_ALREADY_HAS_THIS_PERMISSION: 'User already has this permission.',
  },
  sw: {
    ADMIN_IS_NOT_ACTIVE: 'Msimamizi hayuko hai.',
    APPROVAL_NOT_FOUND: 'Idhini haikupatikana.',
    APPROVAL_REFERENCE_MISSING: 'Rejea ya idhini haipo.',
    APPROVAL_SYNC_IS_NOT_APPLICABLE: 'Ulinganisho wa idhini hauhusiki.',
    ATTACHMENT_EXCEEDS_20MB_LIMIT: 'Kiambatisho kimezidi kikomo cha 20MB.',
    AUDIT_EXPORT_REQUIRES_ACKNOWLEDGEMENT: 'Uhamishaji wa ukaguzi unahitaji uthibitisho.',
    BASEUNITID_AND_SELLUNITID_ARE_REQUIRED: 'baseUnitId na sellUnitId zinahitajika.',
    BRANCH_SCOPE_RESTRICTION: 'Kizuizi cha wigo wa tawi.',
    BRANCH_SCOPED_EXPORT_TYPE_NOT_ALLOWED: 'Aina ya uhamishaji ya wigo wa tawi hairuhusiwi.',
    BRANCH_SCOPED_EXPORTS_REQUIRE_A_BRANCH: 'Uhamishaji wa wigo wa tawi unahitaji tawi.',
    BRANCH_SCOPED_ROLE_RESTRICTION: 'Kizuizi cha jukumu la wigo wa tawi.',
    BUSINESS_CONTEXT_REQUIRED: 'Muktadha wa biashara unahitajika.',
    BUSINESS_ID_CONFIRMATION_DOES_NOT_MATCH: 'Uthibitisho wa kitambulisho cha biashara haulingani.',
    BUSINESS_IS_IN_READ_ONLY_MODE: 'Biashara iko kwenye hali ya kusoma tu.',
    BUSINESS_IS_NOT_ACTIVE: 'Biashara haiko hai.',
    BUSINESS_MUST_BE_ARCHIVED_BEFORE_PURGE: 'Biashara lazima ihifadhiwe kabla ya kuondolewa kabisa.',
    BUSINESS_NOT_FOUND: 'Biashara haikupatikana.',
    CANNOT_ADD_REMINDERS_TO_ARCHIVED_NOTES: 'Haiwezi kuongeza vikumbusho kwenye noti zilizohifadhiwa.',
    CATEGORYID_IS_REQUIRED: 'categoryId inahitajika.',
    CONFIRMATION_TEXT_DOES_NOT_MATCH: 'Maandishi ya uthibitisho hayalingani.',
    CONVERSION_FACTOR_IS_REQUIRED: 'Kipengele cha ubadilishaji kinahitajika.',
    COUNTEDQUANTITY_IS_REQUIRED: 'countedQuantity inahitajika.',
    CREDIT_SALES_ARE_DISABLED: 'Mauzo ya mkopo yamezimwa.',
    CREDIT_SALES_REQUIRE_PERMISSION: 'Mauzo ya mkopo yanahitaji ruhusa.',
    CSV_MUST_INCLUDE_HEADERS: 'CSV lazima iwe na vichwa.',
    CURRENT_PASSWORD_IS_INCORRECT: 'Nenosiri la sasa si sahihi.',
    DEFAULT_UNIT_NOT_CONFIGURED: 'Kipimo chaguo-msingi hakijawekwa.',
    DEVICE_ID_REQUIRED: 'Kitambulisho cha kifaa kinahitajika.',
    DEVICE_NOT_FOUND: 'Kifaa hakikupatikana.',
    DEVICE_NOT_REGISTERED_FOR_THIS_USER: 'Kifaa hakijasajiliwa kwa mtumiaji huyu.',
    EMAIL_IS_NOT_VERIFIED: 'Barua pepe haijathibitishwa.',
    EXPENSES_ARE_NOT_ALLOWED_IN_OFFLINE_MODE: 'Gharama haziruhusiwi katika hali ya nje ya mtandao.',
    EXPORT_JOB_NOT_FOUND: 'Kazi ya uhamishaji haikupatikana.',
    EXPORTS_HTTP_ERROR: 'HTTP {details}',
    IMAGE_EXCEEDS_20MB_LIMIT: 'Picha imezidi kikomo cha 20MB.',
    IMPORT_MISSING_HEADERS: 'Vichwa vinakosekana: {details}',
    INSUFFICIENT_STOCK_FOR_SALE: 'Hisa haitoshi kwa mauzo.',
    INVALID_ACCESS_TOKEN: 'Tokeni ya ufikiaji si sahihi.',
    INVALID_CREDENTIALS: 'Taarifa za kuingia si sahihi.',
    INVALID_EXPENSE_CATEGORY: 'Kategoria ya gharama si sahihi.',
    INVALID_REFUND_QUANTITY: 'Kiasi cha kurejesha si sahihi.',
    INVALID_REMINDER_DATE: 'Tarehe ya kikumbusho si sahihi.',
    INVALID_STOCK_ADJUSTMENT_PAYLOAD: 'Data ya marekebisho ya hisa si sahihi.',
    INVALID_STOCK_COUNT_PAYLOAD: 'Data ya hesabu ya hisa si sahihi.',
    INVALID_SUPPORT_ACCESS_TOKEN: 'Tokeni ya msaada si sahihi.',
    ITEM_QUANTITY_MUST_BE_A_NUMBER: 'Kiasi cha bidhaa lazima kiwe nambari.',
    ITEMS_ARE_REQUIRED: 'Vitu vinahitajika.',
    LINES_ARE_REQUIRED: 'Mistari inahitajika.',
    LINK_REQUIRES_RESOURCE_TYPE_AND_ID: 'Kiungo kinahitaji aina ya rasilimali na kitambulisho.',
    MISSING_ACCESS_TOKEN: 'Tokeni ya ufikiaji haipo.',
    MISSING_NOTIFICATIONS_PERMISSION: 'Ruhusa ya arifa haipo.',
    MISSING_REQUIRED_SIGNUP_FIELDS: 'Sehemu muhimu za kujisajili zinakosekana.',
    MULTIPLE_VARIANTS_MATCHED_THIS_BARCODE: 'Matoleo mengi yamefanana na msimbo wa pau.',
    NAME_IS_REQUIRED: 'Jina linahitajika.',
    NOTES_UNKNOWN_RESOURCE: 'Rasilimali haijulikani kwa {details}',
    NOTES_UNSUPPORTED_LINK_TYPE: 'Aina ya kiungo haijaungwa mkono: {details}',
    NOT_ALLOWED_TO_ARCHIVE_THIS_NOTE: 'Hauruhusiwi kuhifadhi noti hii.',
    NOT_ALLOWED_TO_CANCEL_THIS_REMINDER: 'Hauruhusiwi kufuta kikumbusho hiki.',
    NOT_ALLOWED_TO_EDIT_THIS_NOTE: 'Hauruhusiwi kuhariri noti hii.',
    NOT_ALLOWED_TO_VIEW_REMINDERS: 'Hauruhusiwi kuona vikumbusho.',
    OFFLINE_ACTION_NOT_FOUND: 'Kitendo cha nje ya mtandao hakikupatikana.',
    OFFLINE_DEVICE_ID_IS_REQUIRED: 'Kitambulisho cha kifaa cha nje ya mtandao kinahitajika.',
    OFFLINE_DEVICE_IS_NOT_ACTIVE: 'Kifaa cha nje ya mtandao hakiko hai.',
    OFFLINE_DEVICE_IS_NOT_REGISTERED: 'Kifaa cha nje ya mtandao hakijasajiliwa.',
    OFFLINE_SALE_EXCEEDS_MAX_TOTAL_VALUE: 'Mauzo ya nje ya mtandao yamezidi thamani ya juu.',
    OFFLINE_SALE_OWNER_MISMATCH: 'Mmiliki wa mauzo ya nje ya mtandao haulingani.',
    OFFLINE_SALE_QUEUE_LIMIT_REACHED: 'Kikomo cha foleni ya mauzo ya nje ya mtandao kimefikiwa.',
    OFFLINE_SALES_ARE_NOT_ENABLED: 'Mauzo ya nje ya mtandao hayajawezeshwa.',
    OFFLINE_SESSION_DURATION_EXCEEDED: 'Muda wa kikao cha nje ya mtandao umevukwa.',
    ONLY_COMPLETED_SALES_CAN_BE_REFUNDED: 'Ni mauzo yaliyokamilika pekee yanayoweza kurejeshewa.',
    ONLY_DRAFT_SALES_CAN_BE_VOIDED: 'Ni mauzo ya rasimu pekee yanayoweza kufutwa.',
    PASSWORD_DOES_NOT_MEET_REQUIREMENTS: 'Nenosiri halikidhi masharti.',
    PAYMENT_METHOD_REQUIRED: 'Njia ya malipo inahitajika.',
    PAYMENTS_CANNOT_EXCEED_SALE_TOTAL: 'Malipo hayawezi kuzidi jumla ya mauzo.',
    PRICE_OVERRIDE_IS_ONLY_AVAILABLE_FOR_SALES: 'Kubadilisha bei kunapatikana kwa mauzo pekee.',
    PRIMARY_IMAGE_IS_REQUIRED: 'Picha kuu inahitajika.',
    PRISMA_DELETE_DISABLED: 'Kufuta kumezimwa kwa {details}.',
    PURCHASE_ORDER_LINES_ARE_REQUIRED: 'Mistari ya oda ya manunuzi inahitajika.',
    REASON_IS_REQUIRED: 'Sababu inahitajika.',
    REASON_IS_REQUIRED_FOR_SKU_REASSIGNMENT: 'Sababu inahitajika kwa kuhamisha SKU.',
    RECEIVING_IS_NOT_ALLOWED_IN_OFFLINE_MODE: 'Kupokea hakuruhusiwi katika hali ya nje ya mtandao.',
    RECEIVING_LINE_NOT_FOUND: 'Mstari wa upokeaji haukupatikana.',
    REFRESH_TOKEN_DEVICE_MISMATCH: 'Kifaa cha tokeni ya upya hakilingani.',
    REFRESH_TOKEN_EXPIRED: 'Tokeni ya upya imeisha muda.',
    REFRESH_TOKEN_REUSE_DETECTED: 'Matumizi ya upya ya tokeni yamegunduliwa.',
    REQUEST_ALREADY_RESOLVED: 'Ombi tayari limetatuliwa.',
    REQUEST_EXPIRED: 'Ombi limeisha muda.',
    REQUEST_IS_NOT_APPROVED: 'Ombi halijaidhinishwa.',
    REQUEST_NOT_FOUND: 'Ombi halikupatikana.',
    REQUESTED_TIER_IS_REQUIRED: 'Kiwango kilichoombwa kinahitajika.',
    RESET_TOKEN_EXPIRED: 'Tokeni ya kuweka upya imeisha muda.',
    RETURN_MUST_INCLUDE_AT_LEAST_ONE_ITEM: 'Rejesho lazima liwe na angalau bidhaa moja.',
    S3_BUCKET_NOT_CONFIGURED: 'S3 bucket haijawekwa.',
    SALE_COMPLETION_FAILED: 'Kukamilisha mauzo kumeshindwa.',
    SALE_LINE_NOT_FOUND_FOR_REFUND: 'Mstari wa mauzo kwa kurejesha haukupatikana.',
    SALE_MUST_CONTAIN_AT_LEAST_ONE_LINE: 'Mauzo lazima yawe na angalau mstari mmoja.',
    SALEID_IS_REQUIRED: 'saleId inahitajika.',
    SETTLEMENT_AMOUNT_MUST_BE_POSITIVE: 'Kiasi cha malipo lazima kiwe chanya.',
    SETTLEMENT_EXCEEDS_OUTSTANDING_BALANCE: 'Malipo yamezidi salio linalodaiwa.',
    SMS_SEND_FAILED: 'Infobip SMS imeshindwa kutuma: {details}',
    STOCK_SERVICE_UNAVAILABLE_FOR_APPROVAL: 'Huduma ya hisa haipatikani kwa idhini.',
    STORAGE_LIMIT_EXCEEDED: 'Kikomo cha hifadhi kimevukwa.',
    SUBSCRIPTION_ALREADY_EXISTS: 'Usajili tayari upo.',
    SUBSCRIPTION_NOT_FOUND: 'Usajili haukupatikana.',
    SUBSCRIPTION_REQUEST_ALREADY_RESOLVED: 'Ombi la usajili tayari limetatuliwa.',
    SUBSCRIPTION_REQUEST_NOT_FOUND: 'Ombi la usajili halikupatikana.',
    SUPPLIER_IS_INACTIVE: 'Msambazaji hayuko hai.',
    SUPPORT_ACCESS_IS_READ_ONLY: 'Ufikiaji wa msaada ni wa kusoma tu.',
    SYSTEM_OWNER_ROLE_MISSING: 'Jukumu la mmiliki wa mfumo halipo.',
    TITLE_AND_BODY_ARE_REQUIRED: 'Kichwa na maudhui vinahitajika.',
    TYPE_AND_CSV_ARE_REQUIRED: 'type na csv zinahitajika.',
    TYPE_IS_REQUIRED: 'type inahitajika.',
    UNIT_CODE_ALREADY_EXISTS: 'Nambari ya kipimo tayari ipo.',
    UNIT_CODE_MUST_BE_ALPHANUMERIC: 'Nambari ya kipimo lazima iwe ya herufi na nambari.',
    UNIT_LABEL_IS_REQUIRED: 'Lebo ya kipimo inahitajika.',
    UNIT_NOT_FOUND: 'Kipimo hakikupatikana.',
    UNIT_PRICE_BELOW_MINIMUM_ALLOWED: 'Bei ya kipimo iko chini ya kiwango cha chini.',
    UNIT_PRICE_REQUIRED_FOR_SALE_LINE: 'Bei ya kipimo inahitajika kwa mstari wa mauzo.',
    UNSUPPORTED_EXPORT_TYPE: 'Aina ya uhamishaji haijaungwa mkono.',
    UNSUPPORTED_IMPORT_TYPE: 'Aina ya uingizaji haijaungwa mkono.',
    UNSUPPORTED_UNIT_FOR_THIS_VARIANT: 'Kipimo hiki hakijaungwa mkono kwa toleo hili.',
    USER_IS_NOT_ACTIVE: 'Mtumiaji hayuko hai.',
    USER_IS_NOT_ACTIVE_FOR_ANY_BUSINESS: 'Mtumiaji hayuko hai kwa biashara yoyote.',
    USER_IS_NOT_ACTIVE_FOR_THIS_BUSINESS: 'Mtumiaji hayuko hai kwa biashara hii.',
    USER_NOT_ACTIVE_FOR_THIS_BUSINESS: 'Mtumiaji hayuko hai kwa biashara hii.',
    USER_NOT_FOUND: 'Mtumiaji hakupatikana.',
    VARIANT_IS_INACTIVE_OR_ARCHIVED: 'Toleo haliko hai au limehifadhiwa.',
    VARIANT_IS_NOT_AVAILABLE_AT_THIS_BRANCH:
      'Toleo halipatikani kwenye tawi hili.',
    VARIANT_NOT_FOUND: 'Toleo halikupatikana.',
    VARIANT_NOT_ON_PURCHASE_ORDER: 'Toleo halipo kwenye oda ya manunuzi.',
    VARIANTID_IS_REQUIRED: 'variantId inahitajika.',
    VERIFICATION_TOKEN_EXPIRED: 'Tokeni ya uthibitisho imeisha muda.',
    A_PENDING_SUBSCRIPTION_REQUEST_ALREADY_EXISTS:
      'Ombi la usajili linalosubiri tayari lipo.',
    ADDITIONAL_IMAGES_ARE_NOT_ENABLED_FOR_THIS_SUBSCRIPTION:
      'Picha za ziada hazijawezeshwa kwa usajili huu.',
    AN_OPEN_SHIFT_IS_REQUIRED_FOR_POS_SALES:
      'Zamu iliyo wazi inahitajika kwa mauzo ya POS.',
    AT_LEAST_ONE_REMINDER_CHANNEL_IS_REQUIRED:
      'Angalau njia moja ya kikumbusho inahitajika.',
    AT_LEAST_ONE_BRANCH_IS_REQUIRED_BEFORE_COMPLETING_ONBOARDING:
      'Angalau tawi moja linahitajika kabla ya kukamilisha hatua za mwanzo.',
    ATTACHMENT_TYPE_MUST_BE_JPG_PNG_OR_PDF:
      'Aina ya kiambatisho lazima iwe JPG, PNG, au PDF.',
    BATCH_CODE_IS_REQUIRED_FOR_RECEIVING:
      'Msimbo wa batch unahitajika kwa upokeaji.',
    BATCH_NOT_FOUND_FOR_RECEIVING_LINE:
      'Batch haikupatikana kwa mstari wa upokeaji.',
    BATCH_NOT_FOUND_FOR_SALE_LINE: 'Batch haikupatikana kwa mstari wa mauzo.',
    BATCH_SELECTION_REQUIRES_STOCK_PERMISSION:
      'Uchaguzi wa batch unahitaji ruhusa ya hisa.',
    BRANCH_IS_REQUIRED_FOR_BATCH_TRACKING:
      'Tawi linahitajika kwa ufuatiliaji wa batch.',
    BRANCH_IS_REQUIRED_FOR_BRANCH_VISIBLE_NOTES:
      'Tawi linahitajika kwa noti zinazoonekana kwa tawi.',
    BRANCH_SCOPED_EXPORTS_REQUIRE_A_VALID_BRANCH:
      'Uhamishaji wa wigo wa tawi unahitaji tawi halali.',
    BUSINESS_CHANGED_SINCE_LAST_READ_REFRESH_AND_RETRY:
      'Biashara imebadilika tangu usomaji wa mwisho. Onyesha upya na ujaribu tena.',
    DUPLICATE_IDEMPOTENCY_KEY: 'Ufunguo wa idempotency umerudiwa.',
    DURATION_DAYS_MUST_BE_GREATER_THAN_ZERO:
      'Siku za muda lazima ziwe zaidi ya sifuri.',
    INCIDENT_NOT_FOUND: 'Tukio halikupatikana.',
    INSUFFICIENT_STOCK_FOR_SUPPLIER_RETURN:
      'Hisa haitoshi kwa marejesho ya msambazaji.',
    INVALID_START_DATE: 'Tarehe ya kuanza si sahihi.',
    MANUAL_SUPPLIER_RETURNS_REQUIRE_A_REASON:
      'Marejesho ya msambazaji ya mikono yanahitaji sababu.',
    MINQUANTITY_AND_REORDERQUANTITY_ARE_REQUIRED:
      'minQuantity na reorderQuantity zinahitajika.',
    NO_BATCH_AVAILABLE_FOR_SALE_LINE:
      'Hakuna batch inayopatikana kwa mstari wa mauzo.',
    NOTE_IS_REQUIRED: 'Dokezo linahitajika.',
    OFFLINE_DEVICE_IS_MISSING_FOR_THIS_SALE:
      'Kifaa cha nje ya mtandao hakipo kwa mauzo haya.',
    OFFLINE_MODE_IS_DISABLED_FOR_THIS_SUBSCRIPTION:
      'Hali ya nje ya mtandao imezimwa kwa usajili huu.',
    OFFLINE_MODE_NOT_ENABLED_FOR_THIS_SUBSCRIPTION:
      'Hali ya nje ya mtandao haijawezeshwa kwa usajili huu.',
    OFFLINE_SALE_QUEUE_EXCEEDS_MAXIMUM_ALLOWED:
      'Foleni ya mauzo ya nje ya mtandao imezidi kiwango cha juu kinachoruhusiwa.',
    OFFLINE_SALE_TOTAL_EXCEEDS_MAXIMUM_ALLOWED:
      'Jumla ya mauzo ya nje ya mtandao imezidi kiwango cha juu kinachoruhusiwa.',
    ONLY_FAILED_EXPORT_JOBS_CAN_BE_RETRIED:
      'Ni kazi za uhamishaji zilizoshindwa pekee zinaweza kujaribiwa tena.',
    ONLY_PENDING_EXPORT_JOBS_CAN_BE_CANCELED:
      'Ni kazi za uhamishaji zinazosubiri pekee zinaweza kughairiwa.',
    ONLY_THE_SYSTEM_OWNER_CAN_DELETE_A_BUSINESS:
      'Ni mmiliki wa mfumo pekee anaweza kufuta biashara.',
    PERMISSION_IS_REQUIRED: 'Ruhusa inahitajika.',
    PURCHASE_ORDER_HAS_DUPLICATE_VARIANT_LINES:
      'Oda ya manunuzi ina mistari ya toleo inayojirudia.',
    PURCHASE_ORDER_NOT_APPROVED_FOR_RECEIVING:
      'Oda ya manunuzi haijaidhinishwa kwa upokeaji.',
    PURCHASEID_OR_PURCHASEORDERID_IS_REQUIRED:
      'purchaseId au purchaseOrderId inahitajika.',
    REASON_IS_REQUIRED_FOR_BARCODE_REASSIGNMENT:
      'Sababu inahitajika kwa kuhamisha upya barcode.',
    RECEIVING_LINE_DOES_NOT_MATCH_RETURN_SOURCE:
      'Mstari wa upokeaji haulingani na chanzo cha marejesho.',
    RECEIVING_MUST_INCLUDE_AT_LEAST_ONE_LINE:
      'Upokeaji lazima ujumuisha angalau mstari mmoja.',
    RECEIVING_OVERRIDE_REQUIRES_A_REASON:
      'Kubatilisha upokeaji kunahitaji sababu.',
    REMINDER_CHANNEL_NOT_AVAILABLE_FOR_THIS_TIER:
      'Njia ya kikumbusho haipatikani kwa kiwango hiki.',
    REMOVING_PURCHASE_ORDER_LINES_IS_NOT_ALLOWED:
      'Kuondoa mistari ya oda ya manunuzi hairuhusiwi.',
    RUNNING_EXPORT_JOBS_CANNOT_BE_REQUEUED:
      'Kazi za uhamishaji zinazoendelea haziwezi kuwekwa foleni tena.',
    SESSION_NOT_FOUND: 'Kikao hakikupatikana.',
    STOCK_COUNTS_ARE_NOT_ALLOWED_IN_OFFLINE_MODE:
      'Hesabu za hisa haziruhusiwi katika hali ya nje ya mtandao.',
    SYSTEM_OWNER_PERMISSIONS_ARE_LOCKED:
      'Ruhusa za mmiliki wa mfumo zimefungwa.',
    TRANSFERS_ARE_NOT_ALLOWED_IN_OFFLINE_MODE:
      'Uhamisho hauruhusiwi katika hali ya nje ya mtandao.',
    UNKNOWN_PERMISSION: 'Ruhusa isiyojulikana.',
    USER_ALREADY_HAS_THIS_PERMISSION: 'Mtumiaji tayari ana ruhusa hii.',
  },
};

const extractDetails = (code: string, fallbackMessage?: string) => {
  if (!fallbackMessage) {
    return '';
  }
  if (code === 'EXPORTS_HTTP_ERROR') {
    return fallbackMessage.replace(/^HTTP\\s+/i, '').trim();
  }
  if (code === 'PRISMA_DELETE_DISABLED') {
    return fallbackMessage
      .replace(/^Deletes are disabled for\\s+/i, '')
      .replace(/\\.$/, '')
      .trim();
  }
  if (code === 'NOTES_UNKNOWN_RESOURCE') {
    return fallbackMessage
      .replace(/^Unknown resource for\\s+/i, '')
      .replace(/\\.$/, '')
      .trim();
  }
  if (code === 'NOTES_UNSUPPORTED_LINK_TYPE') {
    return fallbackMessage.replace(/^Unsupported link type:\\s*/i, '').trim();
  }
  if (code === 'IMPORT_MISSING_HEADERS') {
    return fallbackMessage.replace(/^Missing headers:\\s*/i, '').trim();
  }
  if (code === 'SMS_SEND_FAILED') {
    return fallbackMessage.replace(/^Infobip SMS send failed:\\s*/i, '').trim();
  }
  const tail = fallbackMessage.split(':').slice(1).join(':').trim();
  return tail || fallbackMessage;
};

export const resolveApiErrorMessage = (
  code: string,
  locale: ErrorLocale,
  fallbackMessage?: string,
) => {
  const table = API_ERROR_MESSAGES[locale] ?? API_ERROR_MESSAGES.en;
  const template = table[code];
  if (!template) {
    return null;
  }
  if (!template.includes('{details}')) {
    return template;
  }
  const details = extractDetails(code, fallbackMessage);
  return template.replace('{details}', details);
};
