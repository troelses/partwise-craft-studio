/**
 * Template used for newly created documents.
 *
 * Documents store their own `template_id`, and the editor resolves sections
 * against that column — this constant is only the default for new documents
 * and the fallback for legacy rows where `template_id` is null.
 */
export const DEFAULT_TEMPLATE_ID = 'b9a66e83-b40f-417d-abe8-14050e00c5c3';

/**
 * The original template, superseded by `specialebeskrivelse_310826`.
 * Kept so existing documents created against it continue to render.
 */
export const LEGACY_TEMPLATE_ID = '439df5fa-9aa6-4c2f-bb71-f26fa4b29f03';

export const KERNEOPGAVER_SECTION_KEY = 'kerneopgaver';
