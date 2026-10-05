import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { successResponse, unauthorizedResponse } from "@/lib/api-response";

export async function GET(req: NextRequest) {
  const user = await getServerAuthSession();
  if (!user) {
    return unauthorizedResponse("No active session found.");
  }
  return successResponse(user);
}
