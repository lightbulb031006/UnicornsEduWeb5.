import { api } from "@/lib/client";
import type { AppConfig } from "@/dtos/app-config.dto";

export async function getAppConfig(): Promise<AppConfig> {
  const response = await api.get<AppConfig>("/public/app-config");
  return response.data;
}
