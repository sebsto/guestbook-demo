import { Duration, CfnOutput, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_autoscaling as autoscaling } from 'aws-cdk-lib';
import { aws_elasticloadbalancingv2 as elbv2 } from 'aws-cdk-lib';

import { GuestBookProps } from '../lib/guestbook-common';

export class GuestbookEc2Stack extends Stack {

  constructor(scope: Construct, id: string, props?: GuestBookProps) {
    super(scope, id, props);

    let vpc : ec2.Vpc;
    let dbSecurityGroup : ec2.SecurityGroup;
    let dbSecretName : string;
    if (props)  {
      vpc = props!.vpc;
      dbSecurityGroup = props!.dbSecurityGroup!;
      dbSecretName = props!.dbSecretName!;
    } else {
      throw new Error("Guestbook props must be defined.")
    }

    // create a security group for the app
    const appSecurityGroup = new ec2.SecurityGroup(this, "GuestBookAppSecurityGroup", {
      vpc: vpc,
      description: "Security Group Guestbook App",
    });

    // add a rule in the DB security group to allow connections from the app security group
    dbSecurityGroup.addIngressRule(
      appSecurityGroup,
      ec2.Port.tcp(3306),
      'Allow inbound to database port from the app security group'
    );

    // Create role for the EC2 instance
    const applicationRole = new iam.Role(this, "GuestbookAppRole", {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    });
    
    // allow instances to communicate with secrets manager & ssm (for debug purposes if needed)
    applicationRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite"));
    applicationRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));

    // User data that will deploy the application on the instance
    var userdata = ec2.UserData.forLinux();
    userdata.addCommands(
      `echo "GUESTBOOK_SECRET_NAME=${dbSecretName}" >> /opt/guestbook.env`,
      `echo "GUESTBOOK_REGION=${process.env.CDK_DEFAULT_REGION}" >> /opt/guestbook.env`,
      'echo "PORT=8080" >> /opt/guestbook.env',
      'curl https://raw.githubusercontent.com/sebsto/guestbook-demo/main/guestbook-app/setup/userdata.sh > /tmp/userdata.sh', 
      `sh /tmp/userdata.sh ${process.env.CDK_DEFAULT_REGION}`
    );

    const asg = new autoscaling.AutoScalingGroup(this, 'GuestBookAppAutoScalingGroup', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, ec2.InstanceSize.MICRO),

      // get the latest Amazon Linux 2 image for ARM64 CPU
      machineImage: new ec2.AmazonLinuxImage({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2 }
      ), 

      // role granting permission to read / write to DynamoDB table 
      role: applicationRole,

      // script to automatically install the app at boot time 
      userData: userdata,

      // for high availability 
      minCapacity: 2,

      // we trust the health check from the load balancer
      healthCheck: autoscaling.HealthCheck.elb( {
        grace: Duration.seconds(30)
      } ),

      securityGroup: appSecurityGroup
    });

    // Create the load balancer in our VPC. 'internetFacing' is 'false'
    // by default, which creates an internal load balancer.
    const lb = new elbv2.ApplicationLoadBalancer(this, 'GuestBookAppLB', {
      vpc,
      internetFacing: true
    });

    // Add a listener and open up the load balancer's security group
    // to the world.
    const listener = lb.addListener('GuestBookAppListener', {
      port: 80,

      // 'open: true' is the default, you can leave it out if you want. Set it
      // to 'false' and use `listener.connections` if you want to be selective
      // about who can access the load balancer.
      open: true,
    });

    // Add the auto scaling group as a load balancing
    // target to the listener.
    listener.addTargets('GuestBookAppFleet', {
      port: 8080,
      stickinessCookieDuration: Duration.hours(1),
      targets: [asg]
    });    

    // output the Load Balancer DNS Name for easy retrieval
    new CfnOutput(this, 'LoadBalancerDNSName', { value: lb.loadBalancerDnsName });

    // output for easy integration with other AWS services 
    new CfnOutput(this, 'ARNLoadBalancer', { value: lb.loadBalancerArn });
    new CfnOutput(this, 'ARNAutoScalingGroup', { value: asg.autoScalingGroupArn });

  }
}
