import { bootstrapApplication } from '@angular/platform-browser';
import { provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { Amplify } from 'aws-amplify';
import { App } from './app/app';
import { AWS_REGION, BOARD_STORAGE, COGNITO } from './app/aws-config';
import { BOARD_BACKEND, CloudBackend } from './app/board.backends';

// The Cognito user pool gates the page; the identity pool turns that login into short-lived
// credentials for the private bucket that holds the shared board.
Amplify.configure({
  Auth: { Cognito: { userPoolId: COGNITO.userPoolId, userPoolClientId: COGNITO.userPoolClientId, identityPoolId: COGNITO.identityPoolId, loginWith: { email: true } } },
  Storage: { S3: { bucket: BOARD_STORAGE.bucket, region: AWS_REGION } },
});

bootstrapApplication(App, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    { provide: BOARD_BACKEND, useClass: CloudBackend },
  ],
}).catch(err => console.error(err));
