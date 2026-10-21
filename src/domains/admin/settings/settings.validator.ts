import { z } from '@/lib/zod';

export const homeBannerSchema = z.object({
  enabled: z.boolean(),
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(200),
  ctaText: z.string().trim().max(30),
  ctaUrl: z.url({ protocol: /^https?$/ }),
  imageUrl: z.string().trim().max(255).nullable(),
});

export type HomeBanner = z.infer<typeof homeBannerSchema>;
