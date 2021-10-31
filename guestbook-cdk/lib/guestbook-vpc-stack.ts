import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';


export class GuestbookVpcStack extends Stack {

  public vpc : ec2.Vpc;
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    
      // the network for our app 
      this.vpc = new ec2.Vpc(this, 'GuestBookVPC', {
        natGateways: 1, //default value but better to make it explicit
        maxAzs: 3,
        cidr: '10.0.0.0/16',
        subnetConfiguration: [{
          subnetType: ec2.SubnetType.PUBLIC,
          name: 'public - load balancer',
          cidrMask: 24,
        }, {
          subnetType: ec2.SubnetType.PRIVATE,
          name: 'private - application',
          cidrMask: 24
        }, {
          subnetType: ec2.SubnetType.ISOLATED,
          name: 'isolated - database',
          cidrMask: 24
        }]
      });  
  }
}
