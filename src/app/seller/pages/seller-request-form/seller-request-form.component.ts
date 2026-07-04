import { Component } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SellerFirebaseService } from '../../services/seller-firebase.service';

@Component({
  selector: 'app-seller-request-form',
  templateUrl: './seller-request-form.component.html',
  styleUrls: ['./seller-request-form.component.scss'],
})
export class SellerRequestFormComponent {
  loading = false;
  categories = ['Wound care', 'Medical supplies', 'Nutrition', 'Pharmacy', 'Home care', 'Equipment'];

  form = this.fb.group({
    businessName: ['', [Validators.required, Validators.minLength(2)]],
    contactName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
    city: [''],
    productCategories: [[] as string[], Validators.required],
    message: [''],
  });

  constructor(
    private fb: FormBuilder,
    private sellers: SellerFirebaseService,
    private snackBar: MatSnackBar
  ) {}

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    try {
      const value = this.form.getRawValue();
      await this.sellers.createSellerRequest({
        businessName: value.businessName || '',
        contactName: value.contactName || '',
        email: value.email || '',
        phone: value.phone || '',
        city: value.city || '',
        productCategories: value.productCategories || [],
        message: value.message || '',
      });
      this.form.reset({ productCategories: [] });
      this.snackBar.open('Demande vendeur envoyee. Un administrateur vous contactera avec vos identifiants.', 'OK', {
        duration: 6000,
      });
    } catch (error) {
      console.error(error);
      this.snackBar.open('Impossible d envoyer la demande vendeur pour le moment.', 'OK', { duration: 5000 });
    } finally {
      this.loading = false;
    }
  }
}
