import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class RoleRedirectGuard implements CanActivate {
  constructor(private afAuth: AngularFireAuth, private afs: AngularFirestore, private router: Router) {}

  async canActivate(): Promise<boolean | UrlTree> {
    const user = await this.afAuth.currentUser;
    if (!user) {
      return this.router.createUrlTree(['/login']);
    }

    const token = await user.getIdTokenResult(true);
    const claimRoles = Array.isArray((token.claims as any).roles) ? (token.claims as any).roles : [];
    const claimRole = (token.claims as any).role;
    const userDoc = await firstValueFrom(this.afs.doc(`users/${user.uid}`).valueChanges());
    const data = (userDoc as any) || {};
    const docRoles = Array.isArray(data.roles) ? data.roles : (data.role ? [data.role] : []);
    const roles = [...claimRoles, ...(claimRole ? [claimRole] : []), ...docRoles];

    if (roles.includes('admin')) return this.router.createUrlTree(['/admin/dashboard']);
    if (roles.includes('seller')) return this.router.createUrlTree(['/seller/dashboard']);
    if (roles.includes('nurse')) return this.router.createUrlTree(['/nurse/dashboard']);
    if (roles.includes('provider')) return this.router.createUrlTree(['/provider/dashboard']);
    if (roles.includes('employer')) return this.router.createUrlTree(['/patients/dashboard']);
    if (roles.includes('user')) return this.router.createUrlTree(['/patient/dashboard']);

    return this.router.createUrlTree(['/home']);
  }
}
