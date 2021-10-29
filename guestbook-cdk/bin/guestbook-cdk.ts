#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';

//import { GuestBookProps } from '../lib/guestbook-common';
import { GuestbookVpcStack } from '../lib/guestbook-vpc-stack';
import { GuestbookEc2Stack } from '../lib/guestbook-ec2-stack';
import { GuestbookRdsStack } from '../lib/guestbook-rds-stack';

const app = new cdk.App();
const vpcStack = new GuestbookVpcStack(app, 'GuestbookVpcStack', {});

const databaseStack = new GuestbookRdsStack(app, 'GuestbookRdsStack', {
  vpc: vpcStack.vpc
});

const ec2Stack = new GuestbookEc2Stack(app, 'GuestbookEc2Stack', {
  vpc: vpcStack.vpc,
  dbSecurityGroup: databaseStack.dbSecurityGroup,
  dbSecretName: databaseStack.dbCredentialsSecret
});

