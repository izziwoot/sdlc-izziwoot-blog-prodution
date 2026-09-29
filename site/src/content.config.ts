import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { authorsSchema, blogSchema } from './content/schema';

// Astro 7 uses the content-layer loader API; `type: 'content'` is not used.
// The glob loader derives each entry's `id` from its filename, which is what
// keeps GC-13 true: the filename is the only source of the URL slug.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: blogSchema,
});

const authors = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/authors' }),
  schema: authorsSchema,
});

export const collections = { blog, authors };
