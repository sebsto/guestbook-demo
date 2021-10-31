import { Duration, CfnOutput, Stack, Fn } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { aws_iam as iam } from 'aws-cdk-lib';
import { aws_autoscaling as autoscaling } from 'aws-cdk-lib';
import { aws_elasticloadbalancingv2 as elbv2 } from 'aws-cdk-lib';

import { GuestBookProps } from '../lib/guestbook-common';

// just to access the hardcoded database name
import { GuestbookRdsStack } from '../lib/guestbook-rds-stack';

class GuestbookEc2Stack extends Stack {

  protected vpc : ec2.Vpc;
  protected dbSecretName : string;
  protected dbSecurityGroup : ec2.SecurityGroup;

  protected userData : ec2.UserData;
  protected appSecurityGroup : ec2.SecurityGroup;
  protected applicationRole : iam.Role;

  constructor(scope: Construct, id: string, props?: GuestBookProps) {
    super(scope, id, props);

    if (props)  {
      this.vpc = props!.vpc;
      this.dbSecretName = props!.dbSecretName!;
      this.dbSecurityGroup = props!.dbSecurityGroup!;
    } else {
      throw new Error("Guestbook props must be defined.")
    }

    // create a security group for the app
    this.appSecurityGroup = new ec2.SecurityGroup(this, "GuestBookAppSecurityGroup", {
      vpc: this.vpc,
      description: "Security Group Guestbook App",
    });
    // add a rule in the DB security group to allow connections from the app security group
    // THIS CREATES A CYCLIC DEPENDENCY, unless remotePeer = true 
    this.dbSecurityGroup.addIngressRule(
      this.appSecurityGroup,
      ec2.Port.tcp(3306),
      'Allow inbound to database port from the app security group',
      true
    );

    // to avoid cyclic references : 1/ export the sg-id from the Rds Stack
    // 2/ import the value from Rds Stack and 3/ lookup the SG based on the sg-id  
    // but it only works in the same accounteiifccuhdjbbkjddkrjnvculntjbeundtcreidlirtdg

    // const importedDBSecurityGroupID = Fn.importValue('db-security-group-id');
    // const dbSG = ec2.SecurityGroup.fromSecurityGroupId(this, 'dbSecurityGroup', importedDBSecurityGroupID);
    // dbSG.addIngressRule(
    //   this.appSecurityGroup,
    //   ec2.Port.tcp(3306),
    //   'Allow inbound to database port from the app security group'
    // );

    // Create role for the EC2 instance
    this.applicationRole = new iam.Role(this, "GuestbookAppRole", {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    });
    
    // allow instances to communicate with secrets manager & ssm (for debug purposes if needed)
    this.applicationRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("SecretsManagerReadWrite"));
    this.applicationRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));

    // User data that will deploy the application on the instance
    this.userData = ec2.UserData.forLinux();
    this.userData.addCommands(
      `echo "GUESTBOOK_SECRET_NAME=${this.dbSecretName}" >> /opt/guestbook.env`,
      `echo "GUESTBOOK_REGION=${process.env.CDK_DEFAULT_REGION}" >> /opt/guestbook.env`,
      'echo "PORT=8080" >> /opt/guestbook.env',
      `echo "DATABASE=${GuestbookRdsStack.dbName}" >> /opt/guestbook.env`,
      'curl https://raw.githubusercontent.com/sebsto/guestbook-demo/main/guestbook-app/setup/userdata.sh > /tmp/userdata.sh', 
      `sh /tmp/userdata.sh ${process.env.CDK_DEFAULT_REGION}`
    );
    }
};
//
// Deploy multiple instances with an Auto Scaling Group and a Load Balancer
//
export class GuestbookEc2AutoScalingStack extends GuestbookEc2Stack {

  constructor(scope: Construct, id: string, props?: GuestBookProps) {
    super(scope, id, props);

    const asg = new autoscaling.AutoScalingGroup(this, 'GuestBookAppAutoScalingGroup', {
      vpc: this.vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, ec2.InstanceSize.MICRO),

      // get the latest Amazon Linux 2 image for ARM64 CPU
      machineImage: new ec2.AmazonLinuxImage({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2 }
      ), 

      // role granting permission to read / write to DynamoDB table 
      role: this.applicationRole,

      // script to automatically install the app at boot time 
      userData: this.userData,

      // for high availability 
      minCapacity: 2,

      // we trust the health check from the load balancer
      healthCheck: autoscaling.HealthCheck.elb( {
        grace: Duration.seconds(30)
      } ),

      securityGroup: this.appSecurityGroup
    });

    // Create the load balancer in our VPC. 'internetFacing' is 'false'
    // by default, which creates an internal load balancer.
    const lb = new elbv2.ApplicationLoadBalancer(this, 'GuestBookAppLB', {
      vpc: this.vpc,
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
  }
};

//
// If you want to deploy a single instance (without ALB or Autoscaling group) : 
//
export class GuestbookEc2SingleStack extends GuestbookEc2Stack {

  constructor(scope: Construct, id: string, props?: GuestBookProps) {
    super(scope, id, props);    

    // Make sure to place that instance in a public subnet
    const subnets = this.vpc.selectSubnets({subnetType: ec2.SubnetType.PUBLIC});

    var ec2Instance = new ec2.Instance(this, 'Instance', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, ec2.InstanceSize.MICRO),
      vpc: this.vpc,
      vpcSubnets: subnets,
      machineImage: new ec2.AmazonLinuxImage({
          cpuType: ec2.AmazonLinuxCpuType.ARM_64,
          generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2 }
        ),
      role: this.applicationRole,
      securityGroup: this.appSecurityGroup,
      userData: this.userData
    });

    // allow any client to connect to the app
    // this is not necessary in load balancer mode, the CDK creates all SG correctly
    this.appSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      'Allow inbound from anyhost on TCP 8080'
    );    
     
  }
}
