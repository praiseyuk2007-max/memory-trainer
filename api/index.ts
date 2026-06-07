import serverlessHttp from "serverless-http";
// Import from pre-built bundle (handles pino workers, pg, workspace packages correctly)
// @ts-ignore
import app from "../artifacts/api-server/dist/serverless.mjs";

export default serverlessHttp(app);
