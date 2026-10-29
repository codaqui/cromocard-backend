export interface ImageType {
  mimeType: string;
  extension: string;
}

interface ImageSignature extends ImageType {
  matches: (content: Buffer) => boolean;
}

const startsWith = (content: Buffer, bytes: number[], offset = 0) =>
  bytes.every((byte, index) => content[offset + index] === byte);

const asciiBytes = (text: string) => [...text].map((char) => char.charCodeAt(0));

const imageSignatures: ImageSignature[] = [
  {
    mimeType: 'image/png',
    extension: 'png',
    matches: (content) => startsWith(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mimeType: 'image/jpeg',
    extension: 'jpg',
    matches: (content) => startsWith(content, [0xff, 0xd8, 0xff]),
  },
  {
    mimeType: 'image/webp',
    extension: 'webp',
    matches: (content) =>
      startsWith(content, asciiBytes('RIFF')) && startsWith(content, asciiBytes('WEBP'), 8),
  },
];

export function detectImageType(content: Buffer): ImageType | undefined {
  const signature = imageSignatures.find(({ matches }) => matches(content));
  return signature && { mimeType: signature.mimeType, extension: signature.extension };
}
