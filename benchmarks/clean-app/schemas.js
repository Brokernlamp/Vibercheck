const { z } = require("zod");

const noteSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(20_000).optional(),
});

module.exports = { noteSchema };
