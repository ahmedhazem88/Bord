import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { env } from "./env.js";
import { registerAuthPlugin } from "./auth/plugin.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerEntityRoutes } from "./entities/routes.js";
import { registerCapacityRoutes } from "./capacities/routes.js";
import { registerResolutionRoutes } from "./resolutions/routes.js";
import { registerGovernanceRoutes } from "./governance/routes.js";
import { registerMeetingRoutes } from "./meetings/routes.js";
import { registerRegulatoryRoutes } from "./regulatory/routes.js";
import { registerRemunerationRoutes } from "./remuneration/routes.js";
import { registerDocumentRoutes } from "./documents/routes.js";
import { registerMinutesRoutes } from "./minutes/routes.js";
import { registerComplianceRoutes } from "./compliance/routes.js";
import { registerPublicRoutes } from "./public/routes.js";
import { registerProfileRoutes } from "./profile/routes.js";
import { registerGoverningDocumentRoutes } from "./governing-documents/routes.js";
import { registerHiringRoutes } from "./hiring/routes.js";
import { registerElectionRoutes } from "./elections/routes.js";
import { registerInterestRoutes } from "./interests/routes.js";

async function main() {
  const app = Fastify({
    logger: env.NODE_ENV === "development" ? { transport: { target: "pino-pretty" } } : true,
  });

  await app.register(cors, { origin: true });
  await registerAuthPlugin(app);

  app.setErrorHandler((error: FastifyError | ZodError, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "validation_error", issues: error.issues });
    }
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) app.log.error(error);
    return reply.code(statusCode).send({ error: error.message });
  });

  app.get("/health", async () => ({ status: "ok" }));

  await registerAuthRoutes(app);
  await registerEntityRoutes(app);
  await registerCapacityRoutes(app);
  await registerResolutionRoutes(app);
  await registerGovernanceRoutes(app);
  await registerMeetingRoutes(app);
  await registerRegulatoryRoutes(app);
  await registerRemunerationRoutes(app);
  await registerDocumentRoutes(app);
  await registerMinutesRoutes(app);
  await registerComplianceRoutes(app);
  await registerPublicRoutes(app);
  await registerProfileRoutes(app);
  await registerGoverningDocumentRoutes(app);
  await registerHiringRoutes(app);
  await registerElectionRoutes(app);
  await registerInterestRoutes(app);

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
