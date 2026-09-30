import fs from "node:fs";
import path from "node:path";

export type ApiRoute = {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  auth: "bearer" | "none";
  tag: string;
};

const MOUNTS: { file: string; prefix: string; tag: string; auth: "bearer" | "none" | "scan" }[] = [
  { file: "index.route.ts", prefix: "/api", tag: "Public", auth: "scan" },
  { file: "auth.route.ts", prefix: "/api/auth", tag: "Auth", auth: "scan" },
  { file: "admin.route.ts", prefix: "/api/admin", tag: "Admin", auth: "bearer" },
  { file: "user.route.ts", prefix: "/api/users", tag: "Users", auth: "bearer" },
  { file: "job.route.ts", prefix: "/api/jobs", tag: "Jobs", auth: "scan" },
  {
    file: "employer_portal.route.ts",
    prefix: "/api/employer-portal",
    tag: "Employer",
    auth: "bearer",
  },
  { file: "cv.route.ts", prefix: "/api", tag: "CV", auth: "scan" },
  { file: "chat.route.ts", prefix: "/api/chat", tag: "Chat", auth: "bearer" },
];

const METHOD_RE =
  /router\.(get|post|put|patch|delete)\(\s*[\r\n]*["'`]([^"'`]+)["'`]/g;

function routesDir() {
  return path.resolve(__dirname, "../routes");
}

function readRoute(file: string) {
  const dir = routesDir();
  const tsPath = path.join(dir, file);
  if (fs.existsSync(tsPath)) return fs.readFileSync(tsPath, "utf8");
  return fs.readFileSync(path.join(dir, file.replace(/\.ts$/, ".js")), "utf8");
}

function toOpenApiPath(routePath: string) {
  return routePath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function joinRoute(prefix: string, routePath: string) {
  const left = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  if (routePath === "/" || routePath === "") return left || "/";
  const right = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return `${left}${right}`.replace(/\/{2,}/g, "/");
}

export function collectApiRoutes(): ApiRoute[] {
  const routes: ApiRoute[] = [];
  for (const mount of MOUNTS) {
    const source = readRoute(mount.file);
    const fileIsAuthenticated = /router\.use\(\s*authMiddleware\s*\)/.test(source);
    for (const match of source.matchAll(METHOD_RE)) {
      const method = match[1] as ApiRoute["method"];
      const rawPath = match[2] ?? "/";
      const index = match.index ?? 0;
      const window = source.slice(index, index + 280);
      const auth =
        mount.auth === "bearer" || fileIsAuthenticated || window.includes("authMiddleware")
          ? "bearer"
          : "none";
      routes.push({
        method,
        path: toOpenApiPath(joinRoute(mount.prefix, rawPath)),
        auth,
        tag: mount.tag,
      });
    }
  }
  return routes;
}

export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of collectApiRoutes()) {
    const item = paths[route.path] ?? {};
    item[route.method] = {
      tags: [route.tag],
      summary: `${route.method.toUpperCase()} ${route.path}`,
      responses: {
        "200": { description: "Success" },
        "400": { description: "Validation error" },
        "401": { description: "Unauthorized" },
        "429": { description: "Rate limited" },
      },
      ...(route.auth === "bearer"
        ? { security: [{ bearerAuth: [] }] }
        : {}),
    };
    paths[route.path] = item;
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "TopCV Job Portal API",
      version: "1.0.0",
      description:
        "Tài liệu các endpoint HTTP của API. Sinh từ khai báo route trong mã nguồn.",
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    paths,
  };
}
