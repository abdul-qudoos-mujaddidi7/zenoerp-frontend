let phoneIcon =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAACXBIWXMAAHYbAAB2GwH1ht6VAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAACb5JREFUeJztnWuwVlUZx3/PC6WSZh0V1LTyEmUOBkJIeWVAGjLTChocc6QRrcaZbnzoMk0XnWaszEbrizMZCWEUpU1pTY4IBnIr0prS0sFEQwWEsBJw4vDvw9rvmZfDubx777X32nuf9Zt5vxxmr/XnXf93PWuvy7NMEr4wsxZwEXApcA5wCjAOEPAC8ASwDvglsEE+K49kwny0gZmNBq4DFgKndvnYX4GvA8uiEcKR2wBmNgFYCkzIWMTvgKskPZNLSCQTuQxgZpcBPwaOyKljF/B+SQ/nLCeSkswGMLMrgCXAKE9a9gAzJa3zVF6kCzIZoIDGb7MDeKekLZ7LjQxCK+0DZvZhYDH+Gx/gOOAXZpY3pES6JJUBksZfCowuRg4AE4FbCyw/0kHXBjCzuRTf+G2uNbNrSqhnxNPVGCBp/Lsop/Hb7APOk7SpxDpHHMMaIFDjt9kCTJH0YoC6RwRDhoDAjQ/wJuAuMytiwBlhCAOY2QdxkzyhGr/NxcCXAmtoLAOGADObCqwExpSuaGAOAO+T9JvQQprGIQYws9OB9cAxQRQNzi5gsqSnQwtpEgeFgGQ5dxHVa3yAHuIkkXf6jwEWAueFENIl7wBuDy2iSfSFADM7Cbdhow6/sAWS7ggtogl09gCfox6ND/A9M5sSWkQTMEmY2fHAU9THAADP4AaFcZIoB+0eYAH1anyANwKLk4FrJCPtL29uUBXZmQ18ObSIOmPAeODvoYXk4ABwqaRfhxZSR1rA9NAictIClpjZmwPrqCUt3AaMutMDLI2LRulp4SZXmsC7cWcTIikw4J/AG0IL8cTzwCmSXgktpC60qM6Knw9OAD4QWkSdaJoBoL6vtEEw4N/AUaGFeGQ30BPPG3ZHCzcGaBKvw4WCSBc00QDQnEFt4bSo9yzgYNRtXSMYLeDB0CIK4KXQAuqCAUcDLxJ+969PxkraEVpEHWhJeglYG1qIR7bGxu+e9nLwnUFV+CUmmUhB2wA/Af4TUohHHgotoE60ACS9DCwPrMUXq0ILqBOd26kWBVPhj+3A46FF1Ik+A0haQ/2/vFVxCjgd/TdU1n0wGON/Sg46G2hm44BngVcFU5SPMyU9FlpEnTioB5C0DfhVIC15ifE/AwPtqf926Sr8EON/Bg4xgKS1uITOdSPG/wwMdqrmllJV+GFVaAF1ZLAMIaNwy8Snla4oG9uB42MISM+APYCkXuC2krXkIcb/jAx1sPIOYGdZQnIS439GBjVAsj7w/RK15CEaICNDJoo0s2NxeQOqvGs4xv8cDHm2Pkm+UPWxQIz/OegmucLNwL+KFpKDDaEF1JlhDSBpN84EVaWJ29pLo9v0KrcC24oUkoNjQwuoM10ZIHkj+EbBWrIyM7SAOtP1nUFmdjjwJHBSoYrSsx+YKumR0ELqSNcZtiTtA75SoJasjAZ+lqS6i6Qk1a1hSUq2h4FphSnKzhPAdEnPhRZSJ1JfG2dmk4GNZLhxrASiCVKSuhGTO3x+UIAWH4wHVprZiaGF1IWsF0ceg1surmJaeYg9Qddk6sYl7QS+6leKV2JP0CV57g4eBWyi2mnmYk8wDJkHcsmmketxqVqrynhgRXxFHJxcI/nkuveqX/P6NuChGA4GJnMI6CvAzRBuAt7uRVFxxHAwALnf5ZMZwmuA3vxyCiUODAfAy2SOpPXAd3yUVTDRBP3IHQL6CjI7DBcKzvRSYLHEcJDgbTo3SdBch1AAsSfow+t8vqQNwE0+yyyQ+IqIxxDQV6BbMbwfmOG14OIY0eHAuwEAzOwE4BFgnPfCi+FvOBO8UEZlZjYWOBl4PS659TZJz5ZR9yFaitpRbWYzgd9SzWXjgSjEBGZmuDmSi4ALcVfzDpTMejfuxvblwN2lXXohqbAPbsFINfo8jjtkkuf/bLg3oeuBn+I206bV8RzwCWBUke0jqXADtIAHKtCwhZnAU4MP9lmDuwKnngZIvqBxiaNDN2yaz2ZgUoAGH+izE3hvUe1T2BigEzObhotvhxdemT96cfmSVuAa4UTcXsgLgLElazkA3AjcIMnr6mspBgAws7m4lLRWSoXNZCUwT9J2XwWWNkKXtBz4Wln1NZTpwB/M7BxfBZb9inYD8KOS62waJ+P2N3zKR2GlhYC+Cs1ejZspvLDUipvJEuDjkvZkLaB0A0DfruL1wOmlV948HgU+JOmpLA8HmaWT21V8Ge6qmkg+JgK/N7PZWR4ONk0rl9P3YqqdfKIu9AD3mdlNyWJc1wQJAQcJMHsXbkxwZFAhzSHVq2LwhRpJ63AXPu8LraUhpHpVDG4AAEkPAPNwZ/0j+en6VTF4COjEzK4EFlMRYzaEIV8VK2UAADNbANxONIFPNgFzJD3d/x8qZwAAM5uH6wnqenNJFdkFXC5pdecfK2kAADO7HFgGHBZaS4PYA8ySO9IHVNgAAGY2C7gHGBNaS4PYBZwtaQtUPM5Kuh94D/E2cJ/0AIuTvYrVNgCA3H2GM4jTxj65APfaXe0Q0ImZnQHcC5waWktD+AtwVm0MAH2riHfjHBzJz7TKh4BOklXEWcDS0FoawiW1MgCA3IGJq4DPU+30NHVgQq1CQH/MbA5uwuiI0FpqypO1NgD0bTn/OW7bdiQd/61dCOiPXHaSibhziJF07Km9AQAk7QBm48YFdUhQURX21D4E9MfMZuDeEupyND0kqxvRA3QiaQUwiXiXcDdsbJwBACQ9j7tK5kZiSBiK+xoXAvpjZlOBHwJnBJZSNTYD4xvZA3QiaSNwNvAtYm/QyTclHWh8D9BJsgV9EfDW0FoC8ygwRVJv43uATpIt6JOAWxi508gvA1fKZXuv/n4A30jaK2khcD7ulzCS2I87NPJY+w8jzgBtJK0FJgNXAzsCyymDXmC+pHs7/zhiDQAg6YCkxbg7BW6juYPEXuBqSYcso4+oQeBwmNkk4LvAuaG1eGTQxocR3gP0R+762fOB+UCQzJ2e2Q98ZLDGh9gDDEqSyWQ+LtnlQJk9q86Qv/w20QDDYGZjgGuBL1J+eristAd8w+ZjigboEjM7Epcc8gvA0YHlDEXXjQ/RAKkxs+OAzwAfwx2yqBK9uJi/rNsHogEyYmavAT4KfBo4LbAcgL24Gb570jwUDZCTJCfPJcAncUvQIdiJO/m7Ju2D0QAeSRabPovLgFbW0fbVuNH+P7I8HA1QAGbWA8zBDRrPKqiavbjUuze3F3ayEA1QMGY2GbgOuAI4ykORrwB34jKHb81bWDRASSSDxrm4yaVzgdEpi/gj7n6CRT6zhUcDBMDMXotL5zYDeAsuq9dJuKn5/+HuD9oK/Bn4E/CgpM1FaPk/ehz4bcgXNw0AAAAASUVORK5CYII=';

let emailIcon =
  'data:image/png;base64,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';

let logoIcon =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADoAAAAUCAMAAADrw95cAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyBpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYwIDYxLjEzNDc3NywgMjAxMC8wMi8xMi0xNzozMjowMCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNSBXaW5kb3dzIiB4bXBNTTpJbnN0YW5jZUlEPSJ4bXAuaWlkOkNFM0I2ODQyNEI2NzExRjE5OTg2RjE0QTFFODREMEU1IiB4bXBNTTpEb2N1bWVudElEPSJ4bXAuZGlkOkNFM0I2ODQzNEI2NzExRjE5OTg2RjE0QTFFODREMEU1Ij4gPHhtcE1NOkRlcml2ZWRGcm9tIHN0UmVmOmluc3RhbmNlSUQ9InhtcC5paWQ6Q0UzQjY4NDA0QjY3MTFGMTk5ODZGMTRBMUU4NEQwRTUiIHN0UmVmOmRvY3VtZW50SUQ9InhtcC5kaWQ6Q0UzQjY4NDE0QjY3MTFGMTk5ODZGMTRBMUU4NEQwRTUiLz4gPC9yZGY6RGVzY3JpcHRpb24+IDwvcmRmOlJERj4gPC94OnhtcG1ldGE+IDw/eHBhY2tldCBlbmQ9InIiPz7glXwjAAAAGFBMVEX9/v41Y+k4SGWKkaSmrtRZaH/S1uBhX9g/iNXEAAABQElEQVR42pxUi3LDMAgj5vX/fzwkjNOuvdtlauJiByHATuQ6SBMR9QMNjFGLxqkABgc12tcLUsTXqot3Uctw+GMBRgVb9ND4Rb1MfIjlE200F//hJy6ysYO8MqGqex7REZCdUxWCpRfqHfEAXFJnAVQgWo/asE1tRyzbkPqoemve1E7ZUbpVyxBAqWAoEplnXgrq8R8q81BSA/qIAIcYZjU445PKBSSH0qE/1CWHmYmO6+pNhRLbZFMup4ERe4ww3JLvoGoF2+UKUzfG0T+oFCSjuQgSNqVY9RVFbtj7QWxqd8u2oaWs/QDtubmybnSZnV0bPFR+Npsn4SD8hRvj0ou7ep0k+kTU+airBlH1/VMLjPSoMtoSPFqu8hix7x6eAHrYFrxSD4XRdXVZhkP8Dyr7525PqZVwfTyCn50fAQYAt3oJpwyYLnsAAAAASUVORK5CYII=';

import { db } from '../db.js';
import vazirTTF from '../assets/fonts/vazirmatn/Vazirmatn-Regular.ttf?url';
import vazirBoldTTF from '../assets/fonts/vazirmatn/Vazirmatn-Bold.ttf?url';

import { showDate } from '../calendar.js';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { t, shortID } from '../i18n/i18n';
let company = {
  name: '',
  phone: '',
  phone2: '',
  email: '',
  address: '',
  logo: '',
};

function getAccountName(acc) {
  if (!acc) {
    return '';
  }
  if (acc && (acc.code === 'PAYABLE' || acc.code === 'RECEIVABLE')) {
    return '';
  }
  let out = '';
  if (t('Lang') === 'en' && acc.name) {
    out = acc.name;
  } else if (t('Lang') === 'fa' && acc.name_fa) {
    out = acc.name_fa;
  } else if (t('Lang') === 'ps' && acc.name_ps) {
    out = acc.name_ps;
  } else {
    out = '';
  }
  return out;
}

function showBalances(account) {
  let out = '';
  if (account.computedBalances) {
    let i = 0;
    for (const [key, value] of Object.entries(account.computedBalances)) {
      if (i != 0) {
        out += '\n';
      }
      let balance = value.credit - value.debit;
      out += `${Number(balance || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${key}`;
      i++;
    }
  }
  return out;
}

function getDebits(overallBalanceArray) {
  let out = '';
  let i = 0;
  for (const value of overallBalanceArray) {
    if (i != 0) {
      out += '  -  ';
    }
    out += `${Number(value.debit || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${value.currency ? value.currency : value.code}`;
    i++;
  }
  return out;
}

function getCredits(overallBalanceArray) {
  let out = '';
  let i = 0;
  for (const value of overallBalanceArray) {
    if (i != 0) {
      out += '  -  ';
    }
    out += `${Number(value.credit || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${value.currency ? value.currency : value.code}`;
    i++;
  }
  return out;
}

function getBalances(overallBalanceArray) {
  let out = '';
  let i = 0;
  for (const value of overallBalanceArray) {
    if (i != 0) {
      out += '  -  ';
    }
    let balance = value.credit - value.debit;
    out += `${Number(balance || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${value.currency ? value.currency : value.code}`;
    i++;
  }
  return out;
}

function getTotals(tot) {
  return Object.entries(tot)
    .map(([cur, bal]) => `${Number(bal || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${cur}`)
    .join('\n');
}


function formatMulti(bal) {
  return Object.entries(bal)
    .map(([cur]) => `${Number(bal[cur] || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${cur}`)
    .join('\n');
}

let account_types = [];
let account_groups = [];
let accounts = [];
let units = [];

async function loadThings() {
  account_types = await db.account_types.toArray();
  account_groups = await db.account_groups.toArray();
  accounts = await db.accounts.toArray();
  units = await db.product_units.toArray();
  let settings = await db.settings.where({ status: 1 }).toArray();

  company = {
    name: settings.find((s) => s.key == 'company_name')?.value || '',
    phone: settings.find((s) => s.key == 'company_phone')?.value || '',
    phone2: settings.find((s) => s.key == 'company_phone2')?.value || '',
    email: settings.find((s) => s.key == 'company_email')?.value || '',
    address: settings.find((s) => s.key == 'company_address')?.value || '',
    logo: settings.find((s) => s.key == 'company_logo')?.value || '',
  };
}
loadThings();
async function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}
async function loadFont(doc) {
  const res = await fetch(vazirTTF);
  const fontData = await res.arrayBuffer();
  const base64Font = await arrayBufferToBase64(fontData);

  doc.addFileToVFS('Vazirmatn-Regular.ttf', base64Font); // Add font to jsPDF
  doc.addFont('Vazirmatn-Regular.ttf', 'Vazirmatn', 'normal'); // Register it
  doc.setFont('Vazirmatn'); // Use it

  const resBold = await fetch(vazirBoldTTF);
  const fontDataBold = await resBold.arrayBuffer();
  const base64FontBold = await arrayBufferToBase64(fontDataBold);

  doc.addFileToVFS('Vazirmatn-Bold.ttf', base64FontBold); // Add font to jsPDF
  doc.addFont('Vazirmatn-Bold.ttf', 'Vazirmatn', 'bold'); // Register it
  doc.setFont('Vazirmatn'); // Use it
}

export let generatingPDF = false;

let isRTL = t('dir') == 'rtl';

export async function generatePDF(
  type = 'sales',
  filteredItems,
  fromDate,
  toDate,
  length = 0,
  totalAmount = {},
  extraInfo = {},
) {
  if (!generatingPDF) {
    await loadThings();
    generatingPDF = true;
    const doc = new jsPDF();
    await loadFont(doc);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const margin = 7; // half of default ~14

    doc.setFont('Vazirmatn');

    if (company.logo) {
      try {
        doc.addImage(company.logo, 'PNG', pageWidth - margin - 16, 6, 16, 16);
      } catch (e) {}
    }

    // COMPANY NAME
    doc.setFontSize(16);
    doc.setFont('Vazirmatn', 'bold');
    doc.text(company.name || '', company.logo?pageWidth - margin - 18:pageWidth - margin, 11, { align: 'right' });

    // CONTACT INFO
    doc.setFontSize(9);
    doc.setFont('Vazirmatn', 'normal');

    if (company.address) {


    doc.text(t('Address') + `: ${company.address || ''}`, pageWidth - margin - 18, 17, { align: 'right' });

    }

    if (company.phone || company.phone2) {
    doc.setFont('Vazirmatn', 'bold');
    doc.addImage(phoneIcon, 'PNG', margin, 9.5, 3, 3);

    doc.text(t('📞') + `${company.phone || ''} ${company.phone2 ? '- ' + company.phone2 : ''}`, margin + 4, 12, {
      align: 'left',
    });
  }
    if (company.email) {
      doc.addImage(emailIcon, 'PNG', margin, 15.5, 3, 3);

      doc.text(`${company.email || ''}`, margin + 4, 18, { align: 'left' });
    }
    // REPORT TITLE
    doc.setFontSize(9);
    doc.setFont('Vazirmatn', 'normal');

    doc.setFont('Vazirmatn', 'bold');

    if (type == 'accounts') {
      filteredItems = filteredItems.filter((s) => s.include);
      length = filteredItems.length;
      doc.text('گزارش حساب ها', margin + 40, 30, { align: 'right' });
    } else if (type == 'account_financial_report') {
      doc.text('نوعیت گزارش', pageWidth - margin, 30, { align: 'right' });
      doc.text('گزارش مالی حساب', pageWidth - margin - 20, 30, { align: 'right' });
    } else if (type == 'journals_report') {
      doc.text('نوعیت گزارش', pageWidth - margin, 30, { align: 'right' });
      doc.text('گزارش روزنامچه', pageWidth - margin - 20, 30, { align: 'right' });
    } else if (type == 'product_transactions') {  

      doc.text(':نوعیت گزارش', pageWidth - margin, 30, { align: 'right' });

      doc.text('گزارش محصول', pageWidth - margin - 20, 30, { align: 'right' });


      doc.text(`:نام محصول`, pageWidth/2+40, 30, { align: 'right' });

      doc.text(`${extraInfo.product.name}`, pageWidth/2+23, 30, { align: 'right' });

      doc.text(`${shortID(extraInfo.product.id)} :محصول ID`, margin + 40, 30, { align: 'right' });



    } else {
      doc.text('نوعیت گزارش', pageWidth - margin, 30, { align: 'right' });
      doc.text(type == 'sales' ? 'گزارش فروش' : 'گزارش خرید', pageWidth - margin - 20, 30, { align: 'right' });
    }

    doc.setFontSize(9);
    doc.setFont('Vazirmatn', 'normal');
    if (type == 'accounts') {
      doc.setFont('Vazirmatn', 'bold');
      doc.text(getDebits(totalAmount) + ' :' + t('Debit'), pageWidth - margin, 30, { align: 'right' });
      doc.text(getCredits(totalAmount) + ' :' + t('Credit'), pageWidth - margin, 35, { align: 'right' });
      doc.text(getBalances(totalAmount) + ' :' + t('Balance'), pageWidth - margin, 40, { align: 'right' });

      doc.setFont('Vazirmatn', 'normal');
      doc.text('تعداد حساب ها: ' + length, margin + 40, 35, { align: 'right' });
    } else if (type == 'account_financial_report') {
      doc.text(`تاریخ شروع`, pageWidth - margin, 35, { align: 'right' });
      doc.text(`تاریخ پایان`, pageWidth - margin, 40, { align: 'right' });

      doc.text(`${fromDate.toLocaleString()}`, pageWidth - margin - 20, 35.5, { align: 'right' });
      doc.text(`${toDate.toLocaleString()}`, pageWidth - margin - 20, 40.5, { align: 'right' });

      doc.text(`تاریخ شروع`, margin + 40, 35, { align: 'right' });
      doc.text(`تاریخ پایان`, margin + 40, 40, { align: 'right' });

      doc.text(`${showDate(fromDate, 'forPDF')[0]}`, margin + 18, 35, { align: 'left' });

      doc.text(`${showDate(fromDate, 'forPDF')[1]}`, margin + 12.5, 35, { align: 'center' });

      doc.text(`${showDate(fromDate, 'forPDF')[2]}`, margin, 35, { align: 'left' });

      doc.text(`${showDate(toDate, 'forPDF')[0]}`, margin + 18, 40, { align: 'left' });

      doc.text(`${showDate(toDate, 'forPDF')[1]}`, margin + 12.5, 40, { align: 'center' });

      doc.text(`${showDate(toDate, 'forPDF')[2]}`, margin, 40, { align: 'left' });
      doc.setDrawColor(180);
      doc.line(margin, 44, pageWidth - margin, 44);

      doc.setFont('Vazirmatn', 'bold');

      doc.text(`:نام حساب`, pageWidth - margin, 50, {
        align: 'right',
      });

      doc.text(`${getAccountName(extraInfo)}`, pageWidth - margin - 15, 50, {
        align: 'right',
      });

      doc.text(`:شماره حساب`, pageWidth - margin - 80, 50, {
        align: 'right',
      });

      doc.text(`${shortID(extraInfo?.id || '')}`, pageWidth - margin - 100, 50, {
        align: 'right',
      });

      doc.text(`${length} :تعداد تراکنش‌ها`, margin, 50, {
        align: 'left',
      });

      console.log(totalAmount);
      doc.setFont('Vazirmatn', 'bold');
      doc.text(getDebits(totalAmount) + ' :' + t('Debit'), pageWidth - margin - 60, 30, { align: 'right' });
      doc.text(getCredits(totalAmount) + ' :' + t('Credit'), pageWidth - margin - 60, 35, { align: 'right' });
      doc.text(getBalances(totalAmount) + ' :' + t('Balance'), pageWidth - margin - 60, 40, { align: 'right' });
    } else if (type == 'journals_report') {
      doc.text(`تاریخ شروع`, pageWidth - margin, 35, { align: 'right' });
      doc.text(`تاریخ پایان`, pageWidth - margin, 40, { align: 'right' });

      doc.text(`${fromDate.toLocaleString()}`, pageWidth - margin - 20, 35.5, { align: 'right' });
      doc.text(`${toDate.toLocaleString()}`, pageWidth - margin - 20, 40.5, { align: 'right' });

      doc.text(`تاریخ شروع`, margin + 40, 35, { align: 'right' });
      doc.text(`تاریخ پایان`, margin + 40, 40, { align: 'right' });

      doc.text(`${showDate(fromDate, 'forPDF')[0]}`, margin + 18, 35, { align: 'left' });

      doc.text(`${showDate(fromDate, 'forPDF')[1]}`, margin + 12.5, 35, { align: 'center' });

      doc.text(`${showDate(fromDate, 'forPDF')[2]}`, margin, 35, { align: 'left' });

      doc.text(`${showDate(toDate, 'forPDF')[0]}`, margin + 18, 40, { align: 'left' });

      doc.text(`${showDate(toDate, 'forPDF')[1]}`, margin + 12.5, 40, { align: 'center' });

      doc.text(`${showDate(toDate, 'forPDF')[2]}`, margin, 40, { align: 'left' });
      doc.setDrawColor(180);
      doc.line(margin, 44, pageWidth - margin, 44);

      doc.setFont('Vazirmatn', 'bold');

      doc.text(`${length} :تعداد تراکنش‌ها`, margin, 50, {
        align: 'left',
      });

      console.log(totalAmount);
      doc.setFont('Vazirmatn', 'bold');
      doc.text(getDebits(totalAmount) + ' :' + t('Debit'), pageWidth - margin - 60, 30, { align: 'right' });
      doc.text(getCredits(totalAmount) + ' :' + t('Credit'), pageWidth - margin - 60, 35, { align: 'right' });
      doc.text(getBalances(totalAmount) + ' :' + t('Balance'), pageWidth - margin - 60, 40, { align: 'right' });
    } else if (type == 'product_transactions') {
      doc.text(`تاریخ شروع`, pageWidth - margin, 35, { align: 'right' });
      doc.text(`تاریخ پایان`, pageWidth - margin, 40, { align: 'right' });

      

      doc.text(`${Number(extraInfo.product.buy_price).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${shortID(extraInfo.product.buy_currency)}  :قیمت خرید`, pageWidth/2+40, 35, { align: 'right' });

      
      doc.text(`${Number(extraInfo.product.sell_price).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${shortID(extraInfo.product.sell_currency)}  :قیمت فروش`, pageWidth/2+40, 40, { align: 'right' });

      doc.text(`${fromDate.toLocaleString()}`, pageWidth - margin - 20, 35.5, { align: 'right' });
      doc.text(`${toDate.toLocaleString()}`, pageWidth - margin - 20, 40.5, { align: 'right' });

      doc.text(`تاریخ شروع`, margin + 40, 35, { align: 'right' });
      doc.text(`تاریخ پایان`, margin + 40, 40, { align: 'right' });

      doc.text(`${showDate(fromDate, 'forPDF')[0]}`, margin + 18, 35, { align: 'left' });

      doc.text(`${showDate(fromDate, 'forPDF')[1]}`, margin + 12.5, 35, { align: 'center' });

      doc.text(`${showDate(fromDate, 'forPDF')[2]}`, margin, 35, { align: 'left' });

      doc.text(`${showDate(toDate, 'forPDF')[0]}`, margin + 18, 40, { align: 'left' });

      doc.text(`${showDate(toDate, 'forPDF')[1]}`, margin + 12.5, 40, { align: 'center' });

      doc.text(`${showDate(toDate, 'forPDF')[2]}`, margin, 40, { align: 'left' });
      doc.setDrawColor(180);
      doc.line(margin, 44, pageWidth - margin, 44);

      doc.setFont('Vazirmatn', 'bold');

      doc.text(`${length} :تعداد تراکنش ها`, pageWidth - margin, 50, {
        align: 'right',
      });

      
      doc.text(`${Number(extraInfo.qtyBalance).toLocaleString(undefined, { maximumFractionDigits: 3 })} :موجودی`, pageWidth - margin-60, 50, {
        align: 'right',
      });
      doc.text(`${units.find((u) => u.id == extraInfo.product.product_unit_id)?.name}`, pageWidth - margin-80, 50, {
        align: 'right',
      });

      doc.text(`${extraInfo.benefit.toLocaleString(undefined, { maximumFractionDigits: 3 }) + " "+ extraInfo.product.buy_currency} :${t('Benefit')}`, pageWidth / 2-20, 50, {
        align: 'center',
      });
      doc.text(`${extraInfo.predictedBenefit.toLocaleString(undefined, { maximumFractionDigits: 3 }) + " "+ extraInfo.product.buy_currency} :${t('Predicted Benefit')}`, margin, 50, {
        align: 'left',
      });
      if (type == 'sales') {
        let benefits = Object.entries(extraInfo)
          .map(([currency, amount]) => `${amount.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${currency}`)
          .join(' ');
        doc.text(type == 'sales' ? `${benefits} :مجموع مفاد` : `${benefits} :مجموع مفاد`, margin, 50, {
          align: 'left',
        });
      }
    } else {
      doc.text(`تاریخ شروع`, pageWidth - margin, 35, { align: 'right' });
      doc.text(`تاریخ پایان`, pageWidth - margin, 40, { align: 'right' });

      doc.text(`${fromDate.toLocaleString()}`, pageWidth - margin - 20, 35.5, { align: 'right' });
      doc.text(`${toDate.toLocaleString()}`, pageWidth - margin - 20, 40.5, { align: 'right' });

      doc.text(`تاریخ شروع`, margin + 40, 35, { align: 'right' });
      doc.text(`تاریخ پایان`, margin + 40, 40, { align: 'right' });

      doc.text(`${showDate(fromDate, 'forPDF')[0]}`, margin + 18, 35, { align: 'left' });

      doc.text(`${showDate(fromDate, 'forPDF')[1]}`, margin + 12.5, 35, { align: 'center' });

      doc.text(`${showDate(fromDate, 'forPDF')[2]}`, margin, 35, { align: 'left' });

      doc.text(`${showDate(toDate, 'forPDF')[0]}`, margin + 18, 40, { align: 'left' });

      doc.text(`${showDate(toDate, 'forPDF')[1]}`, margin + 12.5, 40, { align: 'center' });

      doc.text(`${showDate(toDate, 'forPDF')[2]}`, margin, 40, { align: 'left' });
      doc.setDrawColor(180);
      doc.line(margin, 44, pageWidth - margin, 44);

      doc.setFont('Vazirmatn', 'bold');

      doc.text(type == 'sales' ? `${length} :تعداد فروش` : `${length} :تعداد خرید`, pageWidth - margin, 50, {
        align: 'right',
      });

      let amounts = Object.entries(totalAmount)
        .map(([currency, amount]) => `${amount.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${currency}`)
        .join(' ');
      doc.text(type == 'sales' ? `${amounts} :مجموع فروش` : `${amounts} :مجموع خرید`, pageWidth / 2, 50, {
        align: 'center',
      });
      if (type == 'sales') {
        let benefits = Object.entries(extraInfo)
          .map(([currency, amount]) => `${amount.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${currency}`)
          .join(' ');
        doc.text(type == 'sales' ? `${benefits} :مجموع مفاد` : `${benefits} :مجموع مفاد`, margin, 50, {
          align: 'left',
        });
      }
    }
    // DIVIDER LINE

    let balance = {};

    filteredItems.forEach((s) => {
      balance[s.currency] = (balance[s.currency] || 0) + Number(s.total_amount);
      s.balance = balance[s.currency];
    });

    if (type == 'accounts') {
      autoTable(doc, {
        startY: 45,

        margin: {
          top: 15,
          bottom: 18,
          left: margin,
          right: margin,
        },

        head: [['#', t('ID'), t('Name'), t('Type'), t('Group'), t('Balance')].reverse()],
        body: filteredItems.map((s, i) =>
          [
            i + 1,
            shortID(s.id),
            getAccountName(s),
            getAccountName(account_types.find((at) => at.id === s.account_type_id)) || '',
            account_groups.find((ag) => ag.id === s.account_group_id)?.name || '',
            showBalances(s),
          ].reverse(),
        ),

        styles: {
          font: 'Vazirmatn',
          fontStyle: 'normal',
          fontSize: 9,
          halign: 'center',
          textColor: 0,
        },

        headStyles: {
          font: 'Vazirmatn',
          fontStyle: 'normal',
          halign: 'center',
          fillColor: [48, 92, 166],
          textColor: 255,
        },

        theme: 'grid',
        showHead: 'everyPage',
      });
    } else if (type == 'account_financial_report') {
      let runningBalances = {};
      let runningDebits = {};
      let runningCredits = {};

      filteredItems = filteredItems.reverse();

      console.log('filteredItems:', filteredItems);
      autoTable(doc, {
        startY: 55,

        margin: {
          top: 15,
          bottom: 18,
          left: margin,
          right: margin,
        },

        head: [
          [
            '#',
            t('ID'),
            t('Date'),
            t('Peer Account'),
            t('Description'),
            t('Debit'),
            t('Credit'),
            t('Balance'),
          ].reverse(),
        ],
        body: [
          ...filteredItems.map((s, i) => {
            runningBalances[s.currency] =
              (runningBalances[s.currency] || 0) + Number(s.first_entry_credit - s.first_entry_debit);
            runningDebits[s.currency] = (runningDebits[s.currency] || 0) + Number(s.first_entry_debit);
            runningCredits[s.currency] = (runningCredits[s.currency] || 0) + Number(s.first_entry_credit);
            return [
              i + 1,
              shortID(s.id),
              showDate(s.created_at, 'forPDF')[2] +
                '/' +
                showDate(s.created_at, 'forPDF')[1] +
                '/' +
                showDate(s.created_at, 'forPDF')[0],
              getAccountName(
                s.second_entry_account != extraInfo.id
                  ? accounts.find((a) => a.id === s.second_entry_account)
                  : accounts.find((a) => a.id === s.first_entry_account),
              ) || '',
              t(s.description),
              s.first_entry_debit != 0 && s.first_entry_debit != null
                ? Number(s.first_entry_debit).toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' ' + s.currency
                : '',
              s.first_entry_credit != 0 && s.first_entry_credit != null
                ? Number(s.first_entry_credit).toLocaleString(undefined, { maximumFractionDigits: 3 }) +
                  ' ' +
                  s.currency
                : '',
              getTotals(runningBalances),
            ].reverse();
          }),
          [
            '',
            '',
            '',
            t('Total'),
            getTotals(runningDebits),
            getTotals(runningCredits),
            getTotals(runningBalances),
          ].reverse(),
        ],

        styles: {
          font: 'Vazirmatn',
          fontStyle: 'normal',
          fontSize: 8,
          halign: 'center',
          textColor: 0,
        },

        headStyles: {
          font: 'Vazirmatn',
          fontStyle: 'normal',
          halign: 'center',
          fillColor: [48, 92, 166],
          textColor: 255,
        },

        theme: 'grid',
        showHead: 'everyPage',
        didParseCell: function (data) {
          const lastRowIndex = filteredItems.length;

          // Make total row bold
          if (data.row.index === lastRowIndex) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [238, 238, 238];
          }
        },
      });
    } else if (type == 'journals_report') {
      let runningBalances = {};
      let runningDebits = {};
      let runningCredits = {};

      filteredItems = filteredItems.reverse();

      console.log('filteredItems:', filteredItems);
      autoTable(doc, {
        startY: 55,

        margin: {
          top: 15,
          bottom: 18,
          left: margin,
          right: margin,
        },

        head: [
          [
            '#',
            t('ID'),
            t('Date'),
            t('Account'),
            t('Peer Account'),
            t('Description'),
            t('Debit'),
            t('Credit'),
            t('Balance'),
          ].reverse(),
        ],
        body: [
          ...filteredItems.map((s, i) => {
            runningBalances[s.currency] =
              (runningBalances[s.currency] || 0) + Number(s.first_entry_credit - s.first_entry_debit);
            runningDebits[s.currency] = (runningDebits[s.currency] || 0) + Number(s.first_entry_debit);
            runningCredits[s.currency] = (runningCredits[s.currency] || 0) + Number(s.first_entry_credit);
            return [
              i + 1,
              shortID(s.id),
              showDate(s.created_at, 'forPDF')[2] +
                '/' +
                showDate(s.created_at, 'forPDF')[1] +
                '/' +
                showDate(s.created_at, 'forPDF')[0],
              getAccountName(accounts.find((a) => a.id === s.first_entry_account)) || '',
              getAccountName(accounts.find((a) => a.id === s.second_entry_account)) || '',
              t(s.description),
              s.first_entry_debit != 0 && s.first_entry_debit != null
                ? Number(s.first_entry_debit).toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' ' + s.currency
                : '',
              s.first_entry_credit != 0 && s.first_entry_credit != null
                ? Number(s.first_entry_credit).toLocaleString(undefined, { maximumFractionDigits: 3 }) +
                  ' ' +
                  s.currency
                : '',
              getTotals(runningBalances),
            ].reverse();
          }),
          [
            '',
            '',
            '',
            t('Total'),
            getTotals(runningDebits),
            getTotals(runningCredits),
            getTotals(runningBalances),
          ].reverse(),
        ],

        styles: {
          font: 'Vazirmatn',
          fontStyle: 'normal',
          fontSize: 8,
          halign: 'center',
          textColor: 0,
        },

        headStyles: {
          font: 'Vazirmatn',
          fontStyle: 'normal',
          halign: 'center',
          fillColor: [48, 92, 166],
          textColor: 255,
        },

        theme: 'grid',
        showHead: 'everyPage',
        didParseCell: function (data) {
          const lastRowIndex = filteredItems.length;

          // Make total row bold
          if (data.row.index === lastRowIndex) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [238, 238, 238];
          }
        },
      });
    } else if (type == 'product_transactions') {
      filteredItems = filteredItems.reverse();
      
      let balances = {};
      autoTable(doc, {
        startY: 55,

        margin: {
          top: 15,
          bottom: 18,
          left: margin,
          right: margin,
        },

        head: [
          [
            '#',
            t('ID'),
            t('Date'),
            t('Type'),
            t('Name') + t('-of-') + t('Account'),
            t('Warehouse'),
            t('Mfg'),
            t('Expiry'),
            t('In'),
            t('Out'),
            t('Quantity Balance'),
            t('Unit Cost'),
            t('Outgoing'),
            t('Incoming'),
            t('In-Out Balance'),
          ].reverse(),
        ],
        body: [
          ...filteredItems.map((s, i) => {
          let type = 'in';
          if (s.transaction_type === 'sale' ||
              s.transaction_type === 'purchase_return' ||
              s.transaction_type === 'adjustment_out' ||
              s.transaction_type === 'transfer_out' ||
              s.transaction_type === 'production_in') {
            type = 'out';
          } else if (s.transaction_type === 'waste') {
            type = 'waste';
          }
          if (type != 'waste') {
            let diff = type == 'out'?s.total_cost:s.total_cost*-1;
            balances[s.currency] = balances[s.currency]?Number(balances[s.currency])+Number(diff):Number(diff);
          }


          return [
            i + 1,
            shortID(s.id),
            showDate(s.created_at, 'forPDF')[2] +
              '/' +
              showDate(s.created_at, 'forPDF')[1] +
              '/' +
              showDate(s.created_at, 'forPDF')[0] + "\n"+s.created_at.slice(0,10),
            t(s.transaction_type)+" "+(s.reference_number || shortID(s.reference_id)),
            t(s.account_name),
            shortID(s.warehouse_id),
            s.manufacturing_date,
            s.expiry_date,
            type === 'in' ? Number(s.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 }) + '\n' + units.find((u) => u.id == s.product_unit_id)?.name : '',
            type === 'out' || type === 'waste'  ? Number(s.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 }) + '\n' + units.find((u) => u.id == s.product_unit_id)?.name : '',
            Number(s.qtyBalance).toLocaleString(undefined, { maximumFractionDigits: 3 }) + '\n' + units.find((u) => u.id == extraInfo.product.product_unit_id)?.name,
            Number(s.unit_cost).toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' ' + s.currency,
            type === 'in' ? Number(s.total_cost).toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' ' + s.currency : '',
            type === 'out' ? Number(s.total_cost).toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' ' + s.currency : '',
             formatMulti(balances),
          ].reverse();
        }),
          [
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            t('Total'),
            Number(extraInfo.qtyBalance).toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' ' + units.find((u) => u.id == extraInfo.product.product_unit_id)?.name,
            '',
            '',
            t('Total'),
            formatMulti(balances),
          ].reverse(),
        ],

        styles: {
          font: 'Vazirmatn',
          fontStyle: 'normal',
          halign: 'center',
          fontSize: 6,
          textColor: 0,
        },

        headStyles: {
          font: 'Vazirmatn',
          fontStyle: 'normal',
          halign: 'center',
          fillColor: [48, 92, 166],
          textColor: 255,
        },

        theme: 'grid',
        showHead: 'everyPage',
        didParseCell: function (data) {
          const lastRowIndex = filteredItems.length;

          // Make total row bold
          if (data.row.index === lastRowIndex) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [238, 238, 238];
          }
        },
      });
    } else {
      const stripTags = (value) => String(value || '').replace(/<[^>]*>/g, '');

      autoTable(doc, {
        startY: 55,

        margin: {
          top: 15,
          bottom: 18,
          left: margin,
          right: margin,
        },

        head: [
          [
        '#',
        t('Date'),
        t('Description'),
        type == 'sales' ? t('Invoice #') : t('Bill #'),
         type == 'sales' ? t('Customer') : t('Supplier'),
        t('Total Amount'),
        t('Balance'),
          ].reverse(),
        ],
        body: filteredItems.map((s, i) =>
          [
        i + 1,
        showDate(type == 'sales' ? s.invoice_date:s.bill_date, 'forPDF')[2] +
          '/' +
          showDate(type == 'sales' ? s.invoice_date:s.bill_date, 'forPDF')[1] +
          '/' +
          showDate(type == 'sales' ? s.invoice_date:s.bill_date, 'forPDF')[0],
        stripTags(s.description),
        stripTags(type == 'sales' ? s.invoice_number : s.bill_number),
        getAccountName(accounts.find((a) => a.id === s.account_id)) || '',
        Number(s.total_amount).toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' ' + s.currency,
        Number(s.balance).toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' ' + s.currency,
          ].reverse(),
        ),

        styles: {
          font: 'Vazirmatn',
          fontStyle: 'normal',
          halign: 'center',
          textColor: 0,
        },

        headStyles: {
          font: 'Vazirmatn',
          fontStyle: 'normal',
          halign: 'center',
          fillColor: [48, 92, 166],
          textColor: 255,
        },

        theme: 'grid',
        showHead: 'everyPage',
      });
    }
    const totalPages = doc.internal.getNumberOfPages();

    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);

      doc.setFontSize(9);
      doc.setFont('Vazirmatn', 'normal');

      doc.text(`صفحه ${i} از ${totalPages}`, pageWidth / 2, pageHeight - 11, {
        align: 'center',
      });
      doc.setDrawColor(180);
      doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);

      doc.setFontSize(7);

      doc.text(t('Powered by ZenoERP'), pageWidth - margin, pageHeight - 12, {
        align: 'right',
      });

      doc.setFontSize(6);

      doc.text((new Date()).toLocaleString(), pageWidth - margin, pageHeight - 9, {
        align: 'right',
      });
      doc.addImage(logoIcon, 'PNG', margin, pageHeight - 14, 8, 3);

      doc.setFont('Vazirmatn', 'normal');
      doc.setFontSize(5);
      doc.text(`www.zenoerp.com`, margin, pageHeight - 9.5, {
        align: 'left',
      });
    }
    doc.save('ZenoERPReport.pdf');
    generatingPDF = false;
  }
}
