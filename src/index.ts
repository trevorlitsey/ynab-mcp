import serverlessExpress from "serverless-http";
import { createApp } from "./app.js";

export const handler = serverlessExpress(createApp());
