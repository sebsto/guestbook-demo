import { CfnOutput, Duration, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_rds as rds } from 'aws-cdk-lib';
import { aws_lambda as lambda } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { CustomResource } from 'aws-cdk-lib';
import { custom_resources as cr } from 'aws-cdk-lib';
import { aws_logs as logs } from 'aws-cdk-lib';

import { GuestBookProps } from './guestbook-common';

export class GuestbookRdsStack extends Stack {

  protected vpc : ec2.Vpc;
  public dbCredentialsSecret : string;
  public dbSecurityGroup : ec2.SecurityGroup;
  public static dbName = "guestbook";

  constructor(scope: Construct, id: string, props?: GuestBookProps) {
    super(scope, id, props);

    if (props)  {
      this.vpc = props!.vpc;
    } else {
      throw new Error("Guestbook props must be defined.");
    }

    // Security group assigned to the database (opens DB port to the App security group)
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'GuestBookDBSecurityGroup',{
      vpc: this.vpc,
      description: "Security Group Guestbook database",
    });

    // output DB Security Group ID for easy lookup by EC2 
    // (can not pass a direct reference to SG object here, it creates a cyclic reference)
    // new CfnOutput(this, 'DBSecurityGroupID', { 
    //   exportName: "db-security-group-id",
    //   value: this.dbSecurityGroup.securityGroupId,
    //  });

  }
};

// create database cluster 
export class GuestbookRdsClusterStack extends GuestbookRdsStack {

  constructor(scope: Construct, id: string, props?: GuestBookProps) {
    super(scope, id, props);
    
    // Aurora MySQL with t3.small instances
    const cluster = new rds.DatabaseCluster(this, 'Database', {
      engine: rds.DatabaseClusterEngine.auroraMysql({ version: rds.AuroraMysqlEngineVersion.VER_3_04_0 }),
      credentials: rds.Credentials.fromGeneratedSecret('admin'), // Optional - will default to 'admin' username and generated password
      defaultDatabaseName: GuestbookRdsStack.dbName,
      instanceProps: {
        // optional , defaults to t3.medium
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MEDIUM),
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        vpc: this.vpc,
        securityGroups: [this.dbSecurityGroup]
      },
    });
    //enable password rotation 
    cluster.addRotationSingleUser();
    this.dbCredentialsSecret = cluster.secret?.secretName || "UNKNOWN SECRET"
  }
}

// create a single instance database 
export class GuestbookRdsSingleStack extends GuestbookRdsStack {

  constructor(scope: Construct, id: string, props?: GuestBookProps) {
    super(scope, id, props);
    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0_34 }),
      databaseName: GuestbookRdsStack.dbName,
      credentials: rds.Credentials.fromGeneratedSecret('admin'), // Optional - will default to 'admin' username and generated password
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.LARGE),
      vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      vpc: this.vpc,
      securityGroups: [this.dbSecurityGroup]
    });

    //enable password rotation 
    database.addRotationSingleUser();
    this.dbCredentialsSecret = database.secret?.secretName || "UNKNOWN SECRET"  
  }
}