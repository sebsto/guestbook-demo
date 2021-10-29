import * as cdk from 'aws-cdk-lib';
import * as GuestbookCdk from '../lib/guestbook-vpc-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new GuestbookCdk.GuestbookCdkStack(app, 'MyTestStack');
    // THEN
    const actual = app.synth().getStackArtifact(stack.artifactId).template;
    expect(actual.Resources ?? {}).toEqual({});
});
