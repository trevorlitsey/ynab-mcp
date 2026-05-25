#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { YnabMcpStack } from "./stack.js";

const app = new App();

new YnabMcpStack(app, "YnabMcp", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
});
