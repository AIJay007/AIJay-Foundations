import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { FoundationsStack } from '../lib/foundations-stack';

const app = new cdk.App();
new FoundationsStack(app, 'AIJay-Foundations', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'ap-southeast-2' },
});
