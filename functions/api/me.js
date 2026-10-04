import { emailFromAccess, logoutUrl } from "../_auth.js";

export async function onRequestGet(context) {
  const email = await emailFromAccess(context.request, context.env);
  if (!email) return Response.json({ email: null });
  return Response.json({ email, logout: logoutUrl(context.env) });
}