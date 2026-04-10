import { z } from "zod";

export const signupSchema = z.object({
  username: z.string().min(4, "Username must be at least 4 characters long"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  email: z.string().email("Invalid email format"),
});
