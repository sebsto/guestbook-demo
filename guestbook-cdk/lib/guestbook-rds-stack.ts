import { Duration, Stack } from 'aws-cdk-lib';
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

  public dbSecurityGroup : ec2.SecurityGroup
  public dbCredentialsSecret : string

  constructor(scope: Construct, id: string, props?: GuestBookProps) {
    super(scope, id, props);

    let vpc : ec2.Vpc;
    if (props)  {
      vpc = props!.vpc;
    } else {
      throw new Error("Guestbook props must be defined.");
    }

    // Security group assigned to the database (opens DB port to the App security group)
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'guestbook-db-sg',{
      vpc: vpc,
      description: "Security Group Guestbook database",
    });

    // create database cluster 
    // Aurora MySQL with t3.small instances
    // const cluster = new rds.DatabaseCluster(this, 'Database', {
    //   engine: rds.DatabaseClusterEngine.auroraMysql({ version: rds.AuroraMysqlEngineVersion.VER_2_09_2 }),
    //   credentials: rds.Credentials.fromGeneratedSecret('admin'), // Optional - will default to 'admin' username and generated password
    //   instanceProps: {
    //     // optional , defaults to t3.medium
    //     instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.SMALL),
    //     vpcSubnets: {
    //       subnetType: ec2.SubnetType.ISOLATED,
    //     },
    //     vpc: vpc,
    //     securityGroups: [this.dbSecurityGroup]
    //   },
    // });
    // //enable password rotation 
    // cluster.addRotationSingleUser();
    // this.dbCredentialsSecret = cluster.secret?.secretName || "UNKNOWN SECRET"

    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.mysql({ version: rds.MysqlEngineVersion.VER_8_0 }),
      credentials: rds.Credentials.fromGeneratedSecret('admin'), // Optional - will default to 'admin' username and generated password
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.LARGE),
      vpcSubnets: {
          subnetType: ec2.SubnetType.ISOLATED,
      },
      vpc: vpc,
      securityGroups: [this.dbSecurityGroup]
    });

    //enable password rotation 
    database.addRotationSingleUser();
    this.dbCredentialsSecret = database.secret?.secretName || "UNKNOWN SECRET"


    // Call custom resource to create the db schema

    // first create a role for a Lambda function
    const lambdaRole = new iam.Role(this, "GuestbookLambdaExecutionRole", {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com')
    });

    // allow lambda  to communicate with secrets manager
    lambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite"));
    lambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));
    lambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaVPCAccessExecutionRole"));

    var lambdaFunction = new lambda.SingletonFunction(this, 'GuestbookLambda', {
        uuid: 'lambda-database-setup-001',
        code: lambda.Code.fromAsset('lib/custom-resource/database-setup'),
        handler: 'index.main',
        description: 'Initial database schema creation',
        timeout: Duration.seconds(300),
        runtime: lambda.Runtime.NODEJS_14_X,
        vpc: vpc,
        role: lambdaRole, 
        vpcSubnets: vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE}),
        environment: {'secretName': this.dbCredentialsSecret}
    });
    
    // Create the custom resource provider with the Lambda
    const customProvider = new cr.Provider(this, 'LambdaProvider', {
      onEventHandler: lambdaFunction,
      logRetention: logs.RetentionDays.ONE_DAY,   // default is INFINITE
      //role: lambdaRole, // must be assumable by the `lambda.amazonaws.com` service principal
    });      
    
    // create the custom resource 
    const resource = new CustomResource(this, 'CreateDataModelResource', {
      serviceToken: customProvider.serviceToken
    });    
  }
}