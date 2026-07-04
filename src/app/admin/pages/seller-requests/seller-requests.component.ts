import { Component } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SellerRequest } from '../../../seller/models/seller.model';
import { SellerFirebaseService } from '../../../seller/services/seller-firebase.service';

interface ApprovalForm {
  authUid: string;
  loginEmail: string;
  temporaryPassword: string;
  adminNotes: string;
}

@Component({
  selector: 'app-seller-requests',
  templateUrl: './seller-requests.component.html',
  styleUrls: ['./seller-requests.component.scss'],
})
export class SellerRequestsComponent {
  requests$ = this.sellerService.listSellerRequests();
  loadingId = '';
  forms: Record<string, ApprovalForm> = {};

  constructor(private sellerService: SellerFirebaseService, private snackBar: MatSnackBar) {}

  formFor(request: SellerRequest): ApprovalForm {
    const id = request.id || '';
    if (!this.forms[id]) {
      this.forms[id] = {
        authUid: request.sellerUid || '',
        loginEmail: request.email || '',
        temporaryPassword: '',
        adminNotes: request.adminNotes || '',
      };
    }
    return this.forms[id];
  }

  async approve(request: SellerRequest): Promise<void> {
    const form = this.formFor(request);
    if (!request.id || !form.authUid || !form.loginEmail) {
      this.snackBar.open('Firebase Auth UID and login email are required.', 'OK', { duration: 4000 });
      return;
    }

    this.loadingId = request.id;
    try {
      await this.sellerService.approveSellerRequest(request, form);
      this.snackBar.open('Seller approved. Send the saved credentials to the vendor.', 'OK', { duration: 5000 });
    } catch (error) {
      console.error(error);
      this.snackBar.open('Unable to approve seller request.', 'OK', { duration: 5000 });
    } finally {
      this.loadingId = '';
    }
  }

  async reject(request: SellerRequest): Promise<void> {
    if (!request.id) return;
    const form = this.formFor(request);
    this.loadingId = request.id;
    try {
      await this.sellerService.rejectSellerRequest(request.id, form.adminNotes || 'Rejected by admin');
      this.snackBar.open('Seller request rejected.', 'OK', { duration: 3000 });
    } catch (error) {
      console.error(error);
      this.snackBar.open('Unable to reject seller request.', 'OK', { duration: 5000 });
    } finally {
      this.loadingId = '';
    }
  }

  async markSent(request: SellerRequest): Promise<void> {
    if (!request.id) return;
    await this.sellerService.markCredentialsSent(request.id);
    this.snackBar.open('Credentials marked as sent.', 'OK', { duration: 3000 });
  }
}
