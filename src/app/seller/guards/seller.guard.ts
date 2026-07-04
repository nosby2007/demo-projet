import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { map, of, switchMap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SellerGuard implements CanActivate {
  constructor(private afAuth: AngularFireAuth, private afs: AngularFirestore, private router: Router) {}

  canActivate() {
    return this.afAuth.idTokenResult.pipe(
      switchMap(res => {
        const claimRoles = (res?.claims?.['roles'] as string[]) || [];
        if (claimRoles.includes('seller')) return of(true);

        const uid = res?.claims?.['user_id'];
        if (!uid) return of(false);
        return this.afs.doc(`users/${uid}`).valueChanges().pipe(
          map((doc: any) => {
            const roles = Array.isArray(doc?.roles) ? doc.roles : (doc?.role ? [doc.role] : []);
            return roles.includes('seller') && doc?.status !== 'suspended';
          })
        );
      }),
      map(isSeller => {
        if (!isSeller) this.router.navigateByUrl('/login');
        return isSeller;
      })
    );
  }
}
