import { z } from 'zod'

export const webDavProfileInputSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9._-]+$/),
    label: z.string().trim().min(1).max(200),
    endpoint: z.string().min(1).max(2_048),
    basePath: z.string().max(2_048).optional(),
    username: z.string().trim().min(1).max(512),
    password: z.string().min(1).max(8_192).nullable().optional(),
    allowInsecureLocal: z.boolean().optional(),
    sessionOnly: z.boolean().optional(),
  })
  .strict()

export const storedWebDavProfileSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    endpoint: z.url(),
    basePath: z.string().startsWith('/'),
    username: z.string().min(1),
    allowInsecureLocal: z.boolean(),
    sessionOnly: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    encryptedPassword: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.sessionOnly && value.encryptedPassword) {
      context.addIssue({
        code: 'custom',
        path: ['encryptedPassword'],
        message: 'Session-only profiles cannot persist credentials',
      })
    }
  })

export const webDavProfileFileSchema = z
  .object({
    version: z.literal(1),
    profiles: z.array(storedWebDavProfileSchema),
  })
  .strict()

export type StoredWebDavProfile = z.infer<typeof storedWebDavProfileSchema>
export type WebDavProfileFile = z.infer<typeof webDavProfileFileSchema>
