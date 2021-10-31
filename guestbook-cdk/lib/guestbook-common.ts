import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { StackProps } from 'aws-cdk-lib';

export interface GuestBookProps extends StackProps {
    vpc : ec2.Vpc;
    dbSecretName? : string;
    dbSecurityGroup? : ec2.SecurityGroup;
  }