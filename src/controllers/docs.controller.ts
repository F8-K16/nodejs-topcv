import { NextFunction, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiDocument } from "../docs/openapi";

const spec = buildOpenApiDocument();

function relaxDocsCsp(_req: Request, res: Response, next: NextFunction) {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline';",
  );
  next();
}

export const docsController = {
  openapi(_req: Request, res: Response) {
    res.json(spec);
  },
  ui: [
    relaxDocsCsp,
    ...swaggerUi.serve,
    swaggerUi.setup(spec, { customSiteTitle: "TopCV API" }),
  ],
};
