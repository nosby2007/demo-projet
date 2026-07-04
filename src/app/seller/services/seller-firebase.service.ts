import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import firebase from 'firebase/compat/app';
import { firstValueFrom, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { Seller, SellerOrder, SellerProduct, SellerRequest } from '../models/seller.model';

@Injectable({ providedIn: 'root' })
export class SellerFirebaseService {
  constructor(private afs: AngularFirestore, private afAuth: AngularFireAuth) {}

  createSellerRequest(request: Omit<SellerRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const id = this.afs.createId();
    const now = firebase.firestore.FieldValue.serverTimestamp();
    return this.afs.doc<SellerRequest>(`sellerRequests/${id}`).set({
      ...request,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  }

  listSellerRequests(): Observable<SellerRequest[]> {
    return this.afs.collection<SellerRequest>('sellerRequests', ref =>
      ref.orderBy('createdAt', 'desc')
    ).valueChanges({ idField: 'id' });
  }

  approveSellerRequest(request: SellerRequest, payload: {
    authUid: string;
    loginEmail: string;
    temporaryPassword?: string;
    adminNotes?: string;
  }): Promise<void> {
    if (!request.id) {
      return Promise.reject(new Error('Seller request id is missing.'));
    }

    const now = firebase.firestore.FieldValue.serverTimestamp();
    const seller: Seller = {
      uid: payload.authUid,
      requestId: request.id,
      businessName: request.businessName,
      contactName: request.contactName,
      email: payload.loginEmail || request.email,
      phone: request.phone,
      city: request.city,
      productCategories: request.productCategories || [],
      status: 'approved',
      createdAt: now,
      updatedAt: now,
    };

    const batch = this.afs.firestore.batch();
    batch.set(this.afs.doc(`sellers/${payload.authUid}`).ref, seller, { merge: true });
    batch.set(this.afs.doc(`users/${payload.authUid}`).ref, {
      email: seller.email,
      displayName: seller.contactName,
      businessName: seller.businessName,
      role: 'seller',
      roles: ['seller'],
      sellerId: payload.authUid,
      status: 'active',
      updatedAt: now,
    }, { merge: true });
    batch.update(this.afs.doc(`sellerRequests/${request.id}`).ref, {
      status: 'approved',
      sellerUid: payload.authUid,
      adminNotes: payload.adminNotes || '',
      approvedAt: now,
      updatedAt: now,
      credentials: {
        loginEmail: seller.email,
        temporaryPassword: payload.temporaryPassword || '',
        sent: false,
      },
    });

    return batch.commit();
  }

  rejectSellerRequest(requestId: string, adminNotes: string): Promise<void> {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    return this.afs.doc(`sellerRequests/${requestId}`).update({
      status: 'rejected',
      adminNotes,
      rejectedAt: now,
      updatedAt: now,
    });
  }

  markCredentialsSent(requestId: string): Promise<void> {
    const now = firebase.firestore.FieldValue.serverTimestamp();
    return this.afs.doc(`sellerRequests/${requestId}`).update({
      'credentials.sent': true,
      'credentials.sentAt': now,
      updatedAt: now,
    });
  }

  getCurrentSeller(): Observable<Seller | null> {
    return this.afAuth.authState.pipe(
      switchMap(user => {
        if (!user) return of(null);
        return this.afs.doc<Seller>(`sellers/${user.uid}`).valueChanges().pipe(
          map(seller => seller ? ({ ...seller, uid: user.uid }) : null)
        );
      })
    );
  }

  listMyProducts(): Observable<SellerProduct[]> {
    return this.afAuth.authState.pipe(
      switchMap(user => {
        if (!user) return of([]);
        return this.afs.collection<SellerProduct>('products', ref =>
          ref.where('sellerId', '==', user.uid).orderBy('createdAt', 'desc')
        ).valueChanges({ idField: 'id' });
      })
    );
  }

  async saveProduct(product: Partial<SellerProduct>): Promise<void> {
    const user = await this.afAuth.currentUser;
    if (!user) throw new Error('Seller must be authenticated.');

    const seller = await firstValueFrom(this.getCurrentSeller());
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const id = product.id || this.afs.createId();

    return this.afs.doc<SellerProduct>(`products/${id}`).set({
      sellerId: user.uid,
      sellerName: seller?.businessName || '',
      name: product.name || '',
      sku: product.sku || '',
      category: product.category || '',
      description: product.description || '',
      price: Number(product.price || 0),
      stock: Number(product.stock || 0),
      imageUrl: product.imageUrl || '',
      status: product.status || 'draft',
      createdAt: product.createdAt || now,
      updatedAt: now,
    }, { merge: true });
  }

  archiveProduct(productId: string): Promise<void> {
    return this.afs.doc(`products/${productId}`).update({
      status: 'archived',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  listMyOrders(): Observable<SellerOrder[]> {
    return this.afAuth.authState.pipe(
      switchMap(user => {
        if (!user) return of([]);
        return this.afs.collection<SellerOrder>('sellerOrders', ref =>
          ref.where('sellerId', '==', user.uid).orderBy('createdAt', 'desc')
        ).valueChanges({ idField: 'id' });
      })
    );
  }

  updateOrderFollowUp(order: SellerOrder, followUpNote: string): Promise<void> {
    if (!order.id) return Promise.reject(new Error('Order id is missing.'));
    return this.afs.doc(`sellerOrders/${order.id}`).update({
      followUpStatus: 'contacted',
      followUpNote,
      lastFollowUpAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  updateDeliveryStatus(order: SellerOrder, deliveryStatus: SellerOrder['deliveryStatus']): Promise<void> {
    if (!order.id) return Promise.reject(new Error('Order id is missing.'));
    return this.afs.doc(`sellerOrders/${order.id}`).update({
      deliveryStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
}
