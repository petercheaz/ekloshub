/** Max raw file size for user-uploaded attachments (receipts, listings, setup media). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Base64 data URLs are ~4/3 the byte length; cap encoded payload separately. */
export const MAX_ATTACHMENT_DATA_URL_LENGTH = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 512;

export function maxAttachmentSizeLabel(): string {
  const mb = MAX_ATTACHMENT_BYTES / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
}

export function attachmentTooLargeMessage(fileName: string): string {
  return `${fileName} is over ${maxAttachmentSizeLabel()}`;
}

export function isAcceptableAttachment(file: { name?: string; size: number; dataUrl?: string }): boolean {
  if (!file.name?.trim() || file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return false;
  }
  if (file.dataUrl && file.dataUrl.length > MAX_ATTACHMENT_DATA_URL_LENGTH) {
    return false;
  }
  return true;
}
