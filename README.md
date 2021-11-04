This is a sample application that I use as the basis for an upcoming AWS Service launch.

This is a simple GuestBook application written with NodeJS and using a MySQL database.

This application is deployed in two different ways, a non-resilient and a resilient one. :

- `bin/guestbook-cdk.ts` [lines 13-23](https://github.com/sebsto/guestbook-demo/blob/main/guestbook-cdk/bin/guestbook-cdk.ts#L15), deploys the application on a single EC2 instance and a single RDS database. 

- `bin/guestbook-cdk.ts` [lines 27-37](https://github.com/sebsto/guestbook-demo/blob/main/guestbook-cdk/bin/guestbook-cdk.ts#L27), deploys the application on two EC2 instances part of an auto scaling group, with a load balancer. It uses a cluster database with two MySQL ßinstances deployed across 2 availability zones.

The two infrastructures are deployed with this script. Point your browser at the IP address of the standalone instance to use the non-resilient stack, or at the load balancer to use the resilient stack.
