export const SELECTORS = {
  login: {
    url: 'http://rishunew.khatacloud.com/Account/Login',
    usernameInput: '#UserName',
    passwordInput: '#Password',
    loginButton: 'button[type="submit"]',
    dashboardIndicator: '.main-sidebar, a[href="/Home/Dashboard"]'
  },
  purchaseInvoice: {
    url: 'http://rishunew.khatacloud.com/Home/entry?TransactionType=143&ComCode=1',
    dateInput: '#nepaliDate5',
    supplierInput: 'input[name="customer_input"]',
    supplierDropdown: '#customers-list',
    supplierOptionFirst: 'ul#customers_listbox li.k-item',
    billNumberInput: 'input[placeholder="Enter Supplier No"]',
    itemInput: 'input[name="products_input"].cproduct_0',
    itemDropdown: 'ul[id="products_{{key}}_listbox"]',
    itemOptionFirst: 'ul[id="products_{{key}}_listbox"] li.k-item',
    quantityInput: 'input.QUANTITY_0',
    rateInput: 'input.RATE_0',
    saveButton: '#testbutn'
  }
};
