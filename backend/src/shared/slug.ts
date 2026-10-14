import { z } from "zod";

export const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const slugSchema = z.string().min(1).max(120).regex(SLUG_REGEX, "Slug inválido.");
