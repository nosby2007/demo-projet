export type SellerRequestStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type ProductStatus = 'draft' | 'active' | 'paused' | 'archived';
export type DeliveryStatus = 'new' | 'preparing' | 'shipped' | 'delivered' | 'blocked' | 'cancelled';
export type FollowUpStatus = 'none' | 'to_contact' | 'contacted' | 'resolved';

export interface SellerRequest {
  id?: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  city?: string;
  productCategories: string[];
  message?: string;
  status: SellerRequestStatus;
  sellerUid?: string;
  adminNotes?: string;
  credentials?: {
    loginEmail: string;
    temporaryPassword?: string;
    sent: boolean;
    sentAt?: any;
  };
  createdAt?: any;
  updatedAt?: any;
  approvedAt?: any;
  rejectedAt?: any;
}

export interface Seller {
  uid: string;
  requestId?: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  city?: string;
  productCategories: string[];
  status: SellerRequestStatus;
  createdAt?: any;
  updatedAt?: any;
}

export interface SellerProduct {
  id?: string;
  sellerId: string;
  sellerName?: string;
  name: string;
  sku?: string;
  category: string;
  description?: string;
  price: number;
  stock: number;
  imageUrl?: string;
  status: ProductStatus;
  createdAt?: any;
  updatedAt?: any;
}

export interface SellerOrder {
  id?: string;
  sellerId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  productSummary?: string;
  total?: number;
  deliveryAddress?: string;
  deliveryStatus: DeliveryStatus;
  followUpStatus: FollowUpStatus;
  followUpNote?: string;
  lastFollowUpAt?: any;
  createdAt?: any;
  updatedAt?: any;
}
