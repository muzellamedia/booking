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

const rooms = ["room1", "room2"];
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

const elements = {
  homePage: document.querySelector("#homePage"),
  bookingPage: document.querySelector("#bookingPage"),
  accountantPage: document.querySelector("#accountantPage"),
  dateRangeTitle: document.querySelector("#dateRangeTitle"),
  dateList: document.querySelector("#dateList"),
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
  accountMonthTitle: document.querySelector("#accountMonthTitle"),
  totalIncome: document.querySelector("#totalIncome"),
  totalExpenses: document.querySelector("#totalExpenses"),
  totalProfit: document.querySelector("#totalProfit"),
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

function roomCountForBooking(booking) {
  if (booking.room === "both") return 2;
  return rooms.includes(booking.room) ? 1 : 0;
}

function dateStatus(dateKey, date) {
  const bookedRooms = (bookingsByDate.get(dateKey) || []).reduce(
    (count, booking) => count + roomCountForBooking(booking),
    0,
  );

  if (bookedRooms >= 2) return "full-booked";
  if (bookedRooms === 1) return "one-booked";
  if ([0, 6].includes(date.getDay())) return "weekend";
  return "available";
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
  return `
    <div class="booking-details">
      <h3>${roomLabel(booking.room)} Details</h3>
      <p><span>Name</span><strong>${booking.name || "Not added"}</strong></p>
      <p><span>Mobile</span><strong>${booking.mobile || "Not added"}</strong></p>
      <p><span>Total Person</span><strong>${booking.persons || 0}</strong></p>
      <p><span>Amount</span><strong>${formatCurrency(Number(booking.amount || 0))}</strong></p>
      <p><span>Aadhaar</span><strong>${booking.aadhaarFileName || "Uploaded file"}</strong></p>
    </div>
  `;
}

function hasAvailableRoom(dateKey) {
  return rooms.some((room) => canBookRoom(dateKey, room));
}

function renderDates() {
  const start = addDays(startOfToday(), dateOffset);
  const end = addDays(start, 29);
  elements.dateRangeTitle.textContent = `${formatDisplayDate(start)} - ${formatDisplayDate(end)}`;
  elements.dateList.innerHTML = "";

  for (let index = 0; index < 30; index += 1) {
    const date = addDays(start, index);
    const dateKey = toDateKey(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `date-button ${dateStatus(dateKey, date)}`;
    button.textContent = formatDisplayDate(date);
    button.dataset.dateKey = dateKey;
    button.setAttribute("aria-label", `Select ${formatDisplayDate(date)}`);

    if (dateKey === selectedDateKey) {
      button.classList.add("selected");
    }

    button.addEventListener("click", () => selectDate(dateKey, date));
    elements.dateList.append(button);

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
        detailsButton.textContent = roomLabel(booking.room);
        detailsButton.addEventListener("click", () => {
          details.innerHTML = renderBookingDetails(booking);
        });
        actions.append(detailsButton);
      });

      const bookButton = document.createElement("button");
      bookButton.type = "button";
      bookButton.className = "primary-button";
      bookButton.textContent = "Book Now";
      bookButton.addEventListener("click", openBookingPage);

      if (hasAvailableRoom(dateKey)) {
        actions.append(bookButton);
      }

      const details = document.createElement("div");
      details.className = "inline-details";
      details.innerHTML = selectedBookings.length
        ? "<p class='message'>Booked room button click ചെയ്താൽ details കാണാം.</p>"
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

function bookedRoomSet(dateKey) {
  const bookedRooms = new Set();
  (bookingsByDate.get(dateKey) || []).forEach((booking) => {
    if (booking.room === "both") {
      rooms.forEach((room) => bookedRooms.add(room));
      return;
    }
    bookedRooms.add(booking.room);
  });
  return bookedRooms;
}

function canBookRoom(dateKey, room) {
  const bookedRooms = bookedRoomSet(dateKey);
  if (room === "both") {
    return rooms.every((singleRoom) => !bookedRooms.has(singleRoom));
  }
  return !bookedRooms.has(room);
}

function updateRoomOptions() {
  Array.from(elements.roomSelect.options).forEach((option) => {
    option.disabled = !canBookRoom(selectedDateKey, option.value);
  });

  const firstAvailable = Array.from(elements.roomSelect.options).find((option) => !option.disabled);
  elements.roomSelect.value = firstAvailable?.value || "";
  elements.bookingSubmitButton.disabled = !firstAvailable;
  elements.bookingMessage.textContent = firstAvailable
    ? ""
    : "Both rooms are already booked for this date.";
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
    elements.bookingMessage.textContent = "Selected room is already booked for this date.";
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
  return toMonthValue(lastCalendarMonthRange().start);
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
    bookingsSnapshot.forEach((doc) => {
      income += Number(doc.data().amount || 0);
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
