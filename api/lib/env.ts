let _appSecret: string | null = null;

export function getAppSecret(): string {
  if (!_appSecret) {
    _appSecret = process.env.APP_SECRET || "";
    if (!_appSecret) {
      console.warn("[env] ⚠️  APP_SECRET not set - JWT auth will fail");
    }
  }
  return _appSecret;
}

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  isDev: process.env.NODE_ENV !== "production",
  port: parseInt(process.env.PORT || "3000"),
  get appSecret() {
    return getAppSecret();
  },
};

export default env;
