// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  firebase: {
    apiKey: "AIzaSyBByAA76jI7hHup-mFQWx1u9rHEkRtfEwE",
    authDomain: "nursehome-7dc3f.firebaseapp.com",
    databaseURL: "https://nursehome-7dc3f-default-rtdb.firebaseio.com",
    projectId: "nursehome-7dc3f",
    storageBucket: "nursehome-7dc3f.firebasestorage.app",
    messagingSenderId: "1098942563500",
    appId: "1:1098942563500:web:c04f64d60ccd50a9f04b09"
  },
  apiBase: 'https://us-central1-nursehome-7dc3f.cloudfunctions.net/api'
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
 import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
