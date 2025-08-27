import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { HttpApi, CorsHttpMethod, HttpMethod } from '@aws-cdk/aws-apigatewayv2-alpha';
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha';

export class FoundationsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1) Cognito
    const userPool = new cognito.UserPool(this, 'AIJayUserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      standardAttributes: { email: { required: true, mutable: false } },
      passwordPolicy: { minLength: 8, requireDigits: true, requireLowercase: true, requireUppercase: false, requireSymbols: false },
    });

    const domain = userPool.addDomain('HostedDomain', {
      cognitoDomain: { domainPrefix: `aijay-${cdk.Stack.of(this).account.slice(-6)}` },
    });

    const iosClient = new cognito.UserPoolClient(this, 'AIJayIOSClient', {
      userPool,
      generateSecret: false,
      authFlows: { userPassword: true, userSrp: true },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        callbackUrls: ['aijay://auth-callback'],
        logoutUrls: ['aijay://signout'],
      },
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    // 2) Storage
    const bucket = new s3.Bucket(this, 'AIJayDataBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
    });

    const users = new dynamodb.Table(this, 'UsersTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
    });

    const sessions = new dynamodb.Table(this, 'SessionsTable', {
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl',
    });

    // 3) API
    const apiHandler = new lambda.NodejsFunction(this, 'ApiHandler', {
      entry: 'services/api/handler.ts',
      runtime: lambda.Runtime.NODEJS_20_X,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        USERS_TABLE: users.tableName,
        SESSIONS_TABLE: sessions.tableName,
        BUCKET_NAME: bucket.bucketName,
        USER_POOL_ID: userPool.userPoolId,
      },
    });

    users.grantReadWriteData(apiHandler);
    sessions.grantReadWriteData(apiHandler);
    bucket.grantReadWrite(apiHandler);

    const httpApi = new HttpApi(this, 'AIJayHttpApi', {
      corsPreflight: {
        allowHeaders: ['Authorization', 'Content-Type'],
        allowMethods: [CorsHttpMethod.ANY],
        allowOrigins: ['*'], // tighten later
      },
    });

    const integration = new HttpLambdaIntegration('ApiIntegration', apiHandler);
    httpApi.addRoutes({ path: '/ping', methods: [HttpMethod.GET], integration });

    // 4) Outputs
    new cdk.CfnOutput(this, 'HttpApiUrl', { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: iosClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CognitoDomain', { value: domain.domainName });
    new cdk.CfnOutput(this, 'DataBucket', { value: bucket.bucketName });
  }
}
