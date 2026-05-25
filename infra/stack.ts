import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { HttpApi, CorsHttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type { Construct } from "constructs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class YnabMcpStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const ynabClientId = process.env.YNAB_CLIENT_ID;
    const ynabClientSecret = process.env.YNAB_CLIENT_SECRET;
    if (!ynabClientId || !ynabClientSecret) {
      throw new Error(
        "YNAB_CLIENT_ID and YNAB_CLIENT_SECRET must be set in the environment when running cdk synth/deploy"
      );
    }

    const table = new Table(this, "StorageTable", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const fn = new NodejsFunction(this, "McpFunction", {
      entry: path.resolve(__dirname, "../src/index.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(30),
      bundling: {
        format: OutputFormat.ESM,
        target: "node22",
        mainFields: ["module", "main"],
        banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
      environment: {
        TABLE_NAME: table.tableName,
        YNAB_CLIENT_ID: ynabClientId,
        YNAB_CLIENT_SECRET: ynabClientSecret,
      },
    });

    table.grantReadWriteData(fn);

    const api = new HttpApi(this, "HttpApi", {
      defaultIntegration: new HttpLambdaIntegration("LambdaIntegration", fn),
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [CorsHttpMethod.ANY],
        allowHeaders: ["*"],
      },
    });

    new CfnOutput(this, "ApiUrl", {
      description: "Public URL for the MCP server (append /mcp for the claude.ai connector)",
      value: api.apiEndpoint,
    });
    new CfnOutput(this, "CallbackUrl", {
      description: "YNAB OAuth redirect URI to register in the YNAB OAuth app",
      value: `${api.apiEndpoint}/callback`,
    });
  }
}
