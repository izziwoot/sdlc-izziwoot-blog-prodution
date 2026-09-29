import { z } from 'zod';

/** Lowercase kebab-case. Applied to slugs and tags alike. */
export const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Closed tag vocabulary. Tags are URLs (/blog/tags/<tag>/), so a rename breaks
 * published links (INV-5). Adding a member is a deliberate reviewed change.
 */
export const TAGS = [
  'ai',
  'llm',
  'architecture',
  'devops',
  'security',
  'career',
  'tooling',
] as const;

/**
 * Entry ids that would collide with a real route under /blog/. A post filename
 * matching one of these is a build error (see scripts/check-filenames.mjs).
 */
export const RESERVED_SLUGS = ['tags'] as const;

/** Astro supplies this via SchemaContext; its return is a zod 4 ZodObject. */
export type ImageHelper = () => z.ZodType;

export const blogSchema = ({ image }: { image: ImageHelper }) =>
  z
    .object({
      title: z.string().min(10).max(70),
      description: z.string().min(70).max(160),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      tags: z
        .array(z.enum(TAGS))
        .min(1)
        .max(4)
        .refine((t) => new Set(t).size === t.length, 'tags must be unique'),
      draft: z.boolean().default(false),
      cover: z
        .object({
          src: image(),
          alt: z.string().min(10, 'alt text must be meaningful, not a filename'),
        })
        .strict()
        .optional(),
      canonicalUrl: z.url().optional(),
      corrections: z
        .array(z.object({ date: z.coerce.date(), note: z.string().min(20) }).strict())
        .optional(),
      retracted: z
        .object({ date: z.coerce.date(), reason: z.string().min(20) })
        .strict()
        .optional(),
      author: z.string().default('adilson-cesar'),
    })
    .strict()
    .refine(
      (d) => !d.updatedDate || d.updatedDate >= d.pubDate,
      'updatedDate cannot precede pubDate',
    );

export const authorsSchema = ({ image }: { image: ImageHelper }) =>
  z
    .object({
      name: z.string().min(2),
      title: z.string().optional(),
      avatar: z.object({ src: image(), alt: z.string().min(5) }).strict().optional(),
      links: z
        .array(
          z
            .object({
              label: z.string().min(1),
              href: z.url(),
              icon: z.enum(['github', 'linkedin', 'x', 'rss', 'email']),
            })
            .strict(),
        )
        .default([]),
    })
    .strict();

export type BlogFrontmatter = z.infer<ReturnType<typeof blogSchema>>;
