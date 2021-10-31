#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';

//import { GuestBookProps } from '../lib/guestbook-common';
import { GuestbookVpcStack } from '../lib/guestbook-vpc-stack';
import { GuestbookEc2SingleStack, GuestbookEc2AutoScalingStack } from '../lib/guestbook-ec2-stack';
import { GuestbookRdsSingleStack, GuestbookRdsClusterStack } from '../lib/guestbook-rds-stack';

const app = new cdk.App();
const vpcStack = new GuestbookVpcStack(app, 'GuestbookVpcStack', {});

// // create a single instance database
// const databaseStack = new GuestbookRdsSingleStack(app, 'GuestbookRdsStack', {
//   vpc: vpcStack.vpc,
// });

// // create a single EC2 instance 
// const ec2Stack = new GuestbookEc2SingleStack(app, 'GuestbookEc2Stack', {
//   vpc: vpcStack.vpc,
//   dbSecretName: databaseStack.dbCredentialsSecret,
//   dbSecurityGroup: databaseStack.dbSecurityGroup
// });


// create a cluster database
const databaseStack = new GuestbookRdsClusterStack(app, 'GuestbookRdsStack', {
  vpc: vpcStack.vpc,
});

// create a an auto scaling group with EC2 instances and load balancer
const ec2Stack = new GuestbookEc2AutoScalingStack(app, 'GuestbookEc2Stack', {
  vpc: vpcStack.vpc,
  dbSecretName: databaseStack.dbCredentialsSecret,
  dbSecurityGroup: databaseStack.dbSecurityGroup
});
