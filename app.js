import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { jsPDF } from "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm";

const firebaseConfig = {
  apiKey: "AIzaSyDfdgLb9xEIQ4bTl4WgNarVh8MoTOCT-i0",
  authDomain: "room-rent-4ba50.firebaseapp.com",
  projectId: "room-rent-4ba50",
  storageBucket: "room-rent-4ba50.firebasestorage.app",
  messagingSenderId: "843413702630",
  appId: "1:843413702630:web:30f71b6f998188d3cc7827",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const bookingSlots = ["room1_day", "room1_night", "room2_day", "room2_night"];
const slotDefinitions = [
  { key: "room1_day", label: "Room 1 Day" },
  { key: "room1_night", label: "Room 1 Night" },
  { key: "room2_day", label: "Room 2 Day" },
  { key: "room2_night", label: "Room 2 Night" },
];
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

let dateOffset = 0;
let selectedDateKey = "";
let bookingsByDate = new Map();
let currentAccountBookings = [];

const elements = {
  homePage: document.querySelector("#homePage"),
  bookingPage: document.querySelector("#bookingPage"),
  accountantPage: document.querySelector("#accountantPage"),
  dateRangeTitle: document.querySelector("#dateRangeTitle"),
  dateList: document.querySelector("#dateList"),
  previousDatesButton: document.querySelector("#previousDatesButton"),
  nextDatesButton: document.querySelector("#nextDatesButton"),
  todayButton: document.querySelector("#todayButton"),
  selectedDatePanel: document.querySelector("#selectedDatePanel"),
  selectedDateText: document.querySelector("#selectedDateText"),
  openBookingButton: document.querySelector("#openBookingButton"),
  bookingDateTitle: document.querySelector("#bookingDateTitle"),
  bookingForm: document.querySelector("#bookingForm"),
  nameInput: document.querySelector("#nameInput"),
  mobileInput: document.querySelector("#mobileInput"),
  roomSelect: document.querySelector("#roomSelect"),
  personInput: document.querySelector("#personInput"),
  amountInput: document.querySelector("#amountInput"),
  aadhaarInput: document.querySelector("#aadhaarInput"),
  bookingSubmitButton: document.querySelector("#bookingSubmitButton"),
  bookingMessage: document.querySelector("#bookingMessage"),
  accountantButton: document.querySelector("#accountantButton"),
  accountMonthSelect: document.querySelector("#accountMonthSelect"),
  downloadMonthButton: document.querySelector("#downloadMonthButton"),
  accountMonthTitle: document.querySelector("#accountMonthTitle"),
  totalIncome: document.querySelector("#totalIncome"),
  totalExpenses: document.querySelector("#totalExpenses"),
  totalProfit: document.querySelector("#totalProfit"),
  accountBookingList: document.querySelector("#accountBookingList"),
  toggleExpenseButton: document.querySelector("#toggleExpenseButton"),
  expenseForm: document.querySelector("#expenseForm"),
  expenseType: document.querySelector("#expenseType"),
  expenseAmount: document.querySelector("#expenseAmount"),
  expenseDate: document.querySelector("#expenseDate"),
  expenseList: document.querySelector("#expenseList"),
  accountMessage: document.querySelector("#accountMessage"),
};

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date) {
  return `${monthNames[date.getMonth()]} ${date.getDate()} ${dayNames[date.getDay()]}`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function showPage(pageName) {
  [elements.homePage, elements.bookingPage, elements.accountantPage].forEach((page) => {
    page.classList.remove("active");
  });
  elements[pageName].classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function slotLabel(slotKey) {
  return slotDefinitions.find((slot) => slot.key === slotKey)?.label || "Slot";
}

function slotShortLabel(slotKey) {
  const label = slotLabel(slotKey);
  return label.replace("Room 1", "R1").replace("Room 2", "R2");
}

function legacySlotKeys(booking) {
  if (booking.room === "both") return [...bookingSlots];
  if (booking.room === "room1") return ["room1_day", "room1_night"];
  if (booking.room === "room2") return ["room2_day", "room2_night"];
  return [];
}

function bookingSlotKeys(booking) {
  if (booking.slotKey && bookingSlots.includes(booking.slotKey)) return [booking.slotKey];
  return legacySlotKeys(booking);
}

function bookedSlotSet(dateKey) {
  const bookedSlots = new Set();
  (bookingsByDate.get(dateKey) || []).forEach((booking) => {
    bookingSlotKeys(booking).forEach((slotKey) => bookedSlots.add(slotKey));
  });
  return bookedSlots;
}

function canBookRoom(dateKey, slotKey) {
  return !bookedSlotSet(dateKey).has(slotKey);
}

function hasAvailableRoom(dateKey) {
  return bookingSlots.some((slotKey) => canBookRoom(dateKey, slotKey));
}

function slotBoxState(dateKey, slotKey) {
  if (!bookedSlotSet(dateKey).has(slotKey)) return "available";
  return slotKey.endsWith("_day") ? "day" : "night";
}

function dateSummary(dateKey, date) {
  const slotStates = bookingSlots.map((slotKey) => slotBoxState(dateKey, slotKey));
  const bookedCount = slotStates.filter((state) => state !== "available").length;
  const hasDay = slotStates.includes("day");
  const hasNight = slotStates.includes("night");

  return {
    slotStates,
    bookedCount,
    isWeekend: [0, 6].includes(date.getDay()),
    statusText:
      bookedCount === 0
        ? dateKey < toDateKey(startOfToday())
          ? "No booking"
          : "4 slots available"
        : bookedCount === 4
          ? "All 4 slots booked"
          : `${bookedCount} of 4 slots booked`,
    cardState:
      bookedCount === 4 ? "full" : hasDay && hasNight ? "mixed" : hasDay ? "day" : hasNight ? "night" : "available",
  };
}

function slotClassName(state, isWeekend) {
  if (state === "available" && isWeekend) return "slot-box available weekend";
  if (state === "available") return "slot-box available";
  if (state === "day") return "slot-box day";
  if (state === "night") return "slot-box night";
  if (state === "mixed") return "slot-box mixed";
  return "slot-box full";
}

async function loadVisibleBookings() {
  const start = addDays(startOfToday(), dateOffset);
  const end = addDays(start, 29);
  const bookingQuery = query(
    collection(db, "bookings"),
    where("dateKey", ">=", toDateKey(start)),
    where("dateKey", "<=", toDateKey(end)),
  );
  const snapshot = await getDocs(bookingQuery);
  bookingsByDate = new Map();

  snapshot.forEach((doc) => {
    const booking = { id: doc.id, ...doc.data() };
    const list = bookingsByDate.get(booking.dateKey) || [];
    list.push(booking);
    bookingsByDate.set(booking.dateKey, list);
  });
}

function roomLabel(room) {
  if (room === "room1") return "Room 1";
  if (room === "room2") return "Room 2";
  if (room === "both") return "Both Rooms";
  return room || "Room";
}

function renderBookingDetails(booking) {
  const aadhaarMarkup = booking.aadhaarUrl
    ? `<a href="${booking.aadhaarUrl}" target="_blank" rel="noopener noreferrer">View</a>`
    : "<strong>Not uploaded</strong>";
  const bookingLabel = booking.slotKey ? slotLabel(booking.slotKey) : roomLabel(booking.room);

  return `
    <div class="booking-details">
      <h3>${bookingLabel} Details</h3>
      <p><span>Name</span><strong>${booking.name || "Not added"}</strong></p>
      <p><span>Mobile</span><strong>${booking.mobile || "Not added"}</strong></p>
      <p><span>Total Person</span><strong>${booking.persons || 0}</strong></p>
      <p><span>Amount</span><strong>${formatCurrency(Number(booking.amount || 0))}</strong></p>
      <p><span>Aadhaar</span>${aadhaarMarkup}</p>
    </div>
  `;
}

function renderDates() {
  const start = addDays(startOfToday(), dateOffset);
  const end = addDays(start, 29);
  elements.dateRangeTitle.textContent = `${formatDisplayDate(start)} - ${formatDisplayDate(end)}`;
  elements.dateList.innerHTML = "";

  for (let index = 0; index < 30; index += 1) {
    const date = addDays(start, index);
    const dateKey = toDateKey(date);
    const summary = dateSummary(dateKey, date);

    const row = document.createElement("div");
    row.className = "date-row";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "date-button";
    button.dataset.dateKey = dateKey;
    button.setAttribute("aria-label", `Select ${formatDisplayDate(date)}`);
    button.innerHTML = `
      <span class="date-label">${formatDisplayDate(date)}</span>
      <span class="date-subtitle">${summary.statusText}</span>
    `;

    if (dateKey === selectedDateKey) {
      button.classList.add("selected");
    }

    button.addEventListener("click", () => selectDate(dateKey, date));
    row.append(button);

    const slotGrid = document.createElement("div");
    slotGrid.className = "slot-grid";

    bookingSlots.forEach((slotKey) => {
      const slotBox = document.createElement("div");
      const state = slotBoxState(dateKey, slotKey);
      slotBox.className = slotClassName(state, summary.isWeekend);
      slotBox.textContent = slotShortLabel(slotKey).replace(" ", "\n");
      slotBox.style.whiteSpace = "pre-line";
      slotBox.title = `${slotLabel(slotKey)}: ${state === "available" ? "Available" : "Booked"}`;
      slotGrid.append(slotBox);
    });

    row.append(slotGrid);
    elements.dateList.append(row);

    if (dateKey === selectedDateKey) {
      const inlinePanel = document.createElement("div");
      inlinePanel.className = "inline-book-panel";

      const actions = document.createElement("div");
      actions.className = "booking-actions";

      const selectedBookings = bookingsByDate.get(dateKey) || [];
      selectedBookings.forEach((booking) => {
        const detailsButton = document.createElement("button");
        detailsButton.type = "button";
        detailsButton.className = "room-detail-button";
        detailsButton.textContent = booking.slotKey ? slotLabel(booking.slotKey) : roomLabel(booking.room);
        detailsButton.addEventListener("click", () => {
          details.innerHTML = renderBookingDetails(booking);
        });
        actions.append(detailsButton);
      });

      if (hasAvailableRoom(dateKey) && dateKey >= toDateKey(startOfToday())) {
        const bookButton = document.createElement("button");
        bookButton.type = "button";
        bookButton.className = "primary-button";
        bookButton.textContent = "Book Now";
        bookButton.addEventListener("click", openBookingPage);
        actions.append(bookButton);
      }

      const details = document.createElement("div");
      details.className = "inline-details";
      details.innerHTML = selectedBookings.length
        ? "<p class='message'>Booked slot button click ചെയ്താല്‍ details കാണാം.</p>"
        : dateKey < toDateKey(startOfToday())
          ? "<p class='message'>No booking found for this date.</p>"
          : "<p class='message'>No booking yet. Book Now click ചെയ്യാം.</p>";

      inlinePanel.append(actions, details);
      elements.dateList.append(inlinePanel);
    }
  }
}

async function refreshDates() {
  elements.dateList.innerHTML = "<p class='message'>Loading dates...</p>";
  try {
    await loadVisibleBookings();
  } catch (error) {
    console.error(error);
    elements.dateList.innerHTML =
      "<p class='message'>Firebase data could not load. Check Firestore rules.</p>";
    return;
  }
  renderDates();
}

function selectDate(dateKey, date) {
  selectedDateKey = dateKey;
  elements.selectedDateText.textContent = formatDisplayDate(date);
  elements.selectedDatePanel.classList.add("hidden");
  renderDates();
}

function selectedDateFromKey() {
  const [year, month, day] = selectedDateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function updateRoomOptions() {
  Array.from(elements.roomSelect.options).forEach((option) => {
    option.disabled = !canBookRoom(selectedDateKey, option.value);
  });

  const firstAvailable = Array.from(elements.roomSelect.options).find((option) => !option.disabled);
  elements.roomSelect.value = firstAvailable?.value || "";
  elements.bookingSubmitButton.disabled = !firstAvailable;
  elements.bookingMessage.textContent = firstAvailable ? "" : "All 4 slots are already booked for this date.";
}

function openBookingPage() {
  if (!selectedDateKey) return;
  elements.bookingDateTitle.textContent = formatDisplayDate(selectedDateFromKey());
  elements.bookingMessage.textContent = "";
  elements.bookingForm.reset();
  updateRoomOptions();
  showPage("bookingPage");
}

async function handleBookingSubmit(event) {
  event.preventDefault();
  elements.bookingMessage.textContent = "Saving booking...";

  const aadhaarFile = elements.aadhaarInput.files[0];
  if (!aadhaarFile) {
    elements.bookingMessage.textContent = "Please upload Aadhaar.";
    return;
  }

  if (!canBookRoom(selectedDateKey, elements.roomSelect.value)) {
    elements.bookingMessage.textContent = "Selected slot is already booked for this date.";
    return;
  }

  try {
    const timestamp = Date.now();
    const filePath = `aadhaar/${selectedDateKey}/${timestamp}-${aadhaarFile.name}`;
    let aadhaarUrl = "";
    let aadhaarUploadStatus = "not_uploaded";

    try {
      const storageRef = ref(storage, filePath);
      await uploadBytes(storageRef, aadhaarFile);
      aadhaarUrl = await getDownloadURL(storageRef);
      aadhaarUploadStatus = "uploaded";
    } catch (uploadError) {
      console.error("Aadhaar upload failed:", uploadError);
      aadhaarUploadStatus = "upload_failed";
    }

    await addDoc(collection(db, "bookings"), {
      dateKey: selectedDateKey,
      name: elements.nameInput.value.trim(),
      mobile: elements.mobileInput.value.trim(),
      room: elements.roomSelect.value,
      slotKey: elements.roomSelect.value,
      persons: Number(elements.personInput.value),
      amount: Number(elements.amountInput.value),
      aadhaarUrl,
      aadhaarPath: filePath,
      aadhaarFileName: aadhaarFile.name,
      aadhaarUploadStatus,
      createdAt: serverTimestamp(),
    });

    elements.bookingMessage.textContent =
      aadhaarUploadStatus === "uploaded"
        ? "Booking saved successfully."
        : "Booking saved. Aadhaar upload failed because Firebase Storage is blocked.";
    selectedDateKey = "";
    elements.selectedDatePanel.classList.add("hidden");
    await refreshDates();
    setTimeout(() => showPage("homePage"), aadhaarUploadStatus === "uploaded" ? 500 : 1800);
  } catch (error) {
    console.error(error);
    elements.bookingMessage.textContent =
      "Booking failed. Check Firestore rules in Firebase Console and try again.";
  }
}

function lastCalendarMonthRange() {
  const today = startOfToday();
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 0);
  return { start, end };
}

function toMonthValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function defaultAccountMonthValue() {
  return toMonthValue(startOfToday());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function bookingLabelForList(booking) {
  return booking.slotKey ? slotLabel(booking.slotKey) : roomLabel(booking.room);
}

function bookingSortValue(booking) {
  return booking.createdAt?.seconds || 0;
}

function buildBookingRowMarkup(booking) {
  const title = escapeHtml(`${booking.dateKey} · ${bookingLabelForList(booking)}`);
  const subtitle = escapeHtml(
    `${booking.name || "Not added"} · ${booking.mobile || "No mobile"} · ${booking.persons || 0} person`,
  );
  return `
    <div class="expense-row booking-row">
      <span>
        <strong>${title}</strong>
        ${subtitle}
      </span>
      <strong>${formatCurrency(Number(booking.amount || 0))}</strong>
    </div>
  `;
}

function downloadBlob(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function buildMonthFileName(monthValue) {
  return `booking-report-${monthValue}.pdf`;
}

function addPdfWrappedLine(doc, text, x, y, maxWidth, lineHeight) {
  const lines = doc.splitTextToSize(text, maxWidth);
  lines.forEach((line) => {
    doc.text(line, x, y.value);
    y.value += lineHeight;
  });
}

function createMonthlyBookingPdf(monthValue, bookings, totals) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const maxWidth = doc.internal.pageSize.getWidth() - marginX * 2;
  const y = { value: 46 };

  const ensureSpace = (needed = 20) => {
    if (y.value + needed <= pageHeight - 40) return;
    doc.addPage();
    y.value = 46;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Monthly Booking Report", marginX, y.value);
  y.value += 26;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Month: ${monthValue}`, marginX, y.value);
  y.value += 18;
  doc.text(`Total Bookings: ${bookings.length}`, marginX, y.value);
  y.value += 18;
  doc.text(`Income: ${formatCurrency(totals.income)}`, marginX, y.value);
  y.value += 18;
  doc.text(`Expenses: ${formatCurrency(totals.expenses)}`, marginX, y.value);
  y.value += 18;
  doc.text(`Profit: ${formatCurrency(totals.income - totals.expenses)}`, marginX, y.value);
  y.value += 26;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Booking Details", marginX, y.value);
  y.value += 20;

  if (!bookings.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text("No bookings found for the selected month.", marginX, y.value);
    return doc;
  }

  bookings.forEach((booking, index) => {
    ensureSpace(88);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${index + 1}. ${booking.dateKey} - ${bookingLabelForList(booking)}`, marginX, y.value);
    y.value += 16;

    doc.setFont("helvetica", "normal");
    addPdfWrappedLine(doc, `Name: ${booking.name || "Not added"}`, marginX + 12, y, maxWidth - 12, 14);
    addPdfWrappedLine(doc, `Mobile: ${booking.mobile || "Not added"}`, marginX + 12, y, maxWidth - 12, 14);
    addPdfWrappedLine(doc, `Persons: ${booking.persons || 0}`, marginX + 12, y, maxWidth - 12, 14);
    addPdfWrappedLine(doc, `Amount: ${formatCurrency(Number(booking.amount || 0))}`, marginX + 12, y, maxWidth - 12, 14);
    addPdfWrappedLine(
      doc,
      `Aadhaar: ${booking.aadhaarUrl ? "Available" : "Not uploaded"}`,
      marginX + 12,
      y,
      maxWidth - 12,
      14,
    );
    y.value += 8;
  });

  return doc;
}

function selectedAccountMonthRange() {
  const monthValue = elements.accountMonthSelect.value || defaultAccountMonthValue();
  const [year, month] = monthValue.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { start, end };
}

async function loadAccountant() {
  if (!elements.accountMonthSelect.value) {
    elements.accountMonthSelect.value = defaultAccountMonthValue();
  }

  const { start, end } = selectedAccountMonthRange();
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  elements.accountMonthTitle.textContent = `${monthNames[start.getMonth()]} ${start.getFullYear()}`;
  elements.accountMessage.textContent = "Loading account...";

  try {
    const bookingsSnapshot = await getDocs(
      query(
        collection(db, "bookings"),
        where("dateKey", ">=", startKey),
        where("dateKey", "<=", endKey),
      ),
    );
    const expensesSnapshot = await getDocs(
      query(
        collection(db, "expenses"),
        where("dateKey", ">=", startKey),
        where("dateKey", "<=", endKey),
      ),
    );

    let income = 0;
    const bookingRows = [];
    bookingsSnapshot.forEach((doc) => {
      const booking = { id: doc.id, ...doc.data() };
      income += Number(booking.amount || 0);
      bookingRows.push(booking);
    });

    let expenses = 0;
    const expenseRows = [];
    expensesSnapshot.forEach((doc) => {
      const expense = doc.data();
      const amount = Number(expense.amount || 0);
      expenses += amount;
      expenseRows.push({ ...expense, amount });
    });

    elements.totalIncome.textContent = formatCurrency(income);
    elements.totalExpenses.textContent = formatCurrency(expenses);
    elements.totalProfit.textContent = formatCurrency(income - expenses);
    currentAccountBookings = bookingRows.sort((first, second) => {
      const dateCompare = first.dateKey.localeCompare(second.dateKey);
      if (dateCompare !== 0) return dateCompare;
      return bookingSortValue(first) - bookingSortValue(second);
    });
    elements.accountBookingList.innerHTML = currentAccountBookings.length
      ? currentAccountBookings.map((booking) => buildBookingRowMarkup(booking)).join("")
      : "<p class='message'>No bookings added for selected month.</p>";
    elements.expenseList.innerHTML = expenseRows.length
      ? expenseRows
          .sort((first, second) => first.dateKey.localeCompare(second.dateKey))
          .map(
            (expense) => `
              <div class="expense-row">
                <span>${expense.dateKey} · ${expense.type}</span>
                <strong>${formatCurrency(expense.amount)}</strong>
              </div>
            `,
          )
          .join("")
      : "<p class='message'>No expenses added for selected month.</p>";
    elements.accountMessage.textContent = "";
  } catch (error) {
    console.error(error);
    elements.accountMessage.textContent = "Account data could not load. Check Firestore rules.";
  }
}

async function handleExpenseSubmit(event) {
  event.preventDefault();
  elements.accountMessage.textContent = "Saving expense...";

  try {
    await addDoc(collection(db, "expenses"), {
      type: elements.expenseType.value,
      amount: Number(elements.expenseAmount.value),
      dateKey: elements.expenseDate.value,
      createdAt: serverTimestamp(),
    });
    elements.expenseForm.reset();
    elements.expenseForm.classList.add("hidden");
    await loadAccountant();
    elements.accountMessage.textContent = "Expense saved.";
  } catch (error) {
    console.error(error);
    elements.accountMessage.textContent = "Expense failed. Check Firebase rules and try again.";
  }
}

function handleMonthPdfDownload() {
  const monthValue = elements.accountMonthSelect.value || defaultAccountMonthValue();
  const incomeText = elements.totalIncome.textContent;
  const expensesText = elements.totalExpenses.textContent;
  const profitText = elements.totalProfit.textContent;

  elements.accountMessage.textContent = "Preparing PDF...";

  try {
    const doc = createMonthlyBookingPdf(monthValue, currentAccountBookings, {
      income: Number(incomeText.replace(/[^\d.-]/g, "")) || 0,
      expenses: Number(expensesText.replace(/[^\d.-]/g, "")) || 0,
      profit: Number(profitText.replace(/[^\d.-]/g, "")) || 0,
    });
    downloadBlob(doc.output("blob"), buildMonthFileName(monthValue));
    elements.accountMessage.textContent = "PDF downloaded.";
  } catch (error) {
    console.error(error);
    elements.accountMessage.textContent = "PDF download failed. Please try again.";
  }
}

elements.previousDatesButton.addEventListener("click", () => {
  dateOffset -= 30;
  selectedDateKey = "";
  elements.selectedDatePanel.classList.add("hidden");
  refreshDates();
});

elements.nextDatesButton.addEventListener("click", () => {
  dateOffset += 30;
  selectedDateKey = "";
  elements.selectedDatePanel.classList.add("hidden");
  refreshDates();
});

elements.todayButton.addEventListener("click", () => {
  dateOffset = 0;
  selectedDateKey = "";
  elements.selectedDatePanel.classList.add("hidden");
  refreshDates();
});

elements.openBookingButton.addEventListener("click", openBookingPage);
elements.bookingForm.addEventListener("submit", handleBookingSubmit);
elements.accountantButton.addEventListener("click", async () => {
  showPage("accountantPage");
  await loadAccountant();
});
elements.accountMonthSelect.addEventListener("change", loadAccountant);
elements.downloadMonthButton.addEventListener("click", handleMonthPdfDownload);
elements.toggleExpenseButton.addEventListener("click", () => {
  const { start } = selectedAccountMonthRange();
  elements.expenseDate.value ||= toDateKey(start);
  elements.expenseForm.classList.toggle("hidden");
});
elements.expenseForm.addEventListener("submit", handleExpenseSubmit);
document.querySelectorAll("[data-back-home]").forEach((button) => {
  button.addEventListener("click", () => showPage("homePage"));
});

refreshDates();
