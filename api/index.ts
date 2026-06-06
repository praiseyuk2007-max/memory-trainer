import serverlessHttp from "serverless-http";
import app from "../artifacts/api-server/src/app";

export default serverlessHttp(app);
