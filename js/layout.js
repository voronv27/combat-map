// JS code that is not being shared by the server (notes, screen layout, etc)

/* CODE FOR DROPDOWN MENU (on mobile) */
const dropdownMenu = document.getElementById("header-dropdown");
const dropdownMenuOpenBtn = document.getElementById("header-dropdown-open");
const dropdownMenuCloseBtn = document.getElementById("header-dropdown-close");
function openHeaderDropdown() {
    dropdownMenu.classList.remove("hidden");
    dropdownMenuOpenBtn.classList.add("hidden");
    dropdownMenuCloseBtn.classList.remove("hidden");
}

function closeHeaderDropdown() {
    dropdownMenu.classList.add("hidden");
    dropdownMenuOpenBtn.classList.remove("hidden");
    dropdownMenuCloseBtn.classList.add("hidden");
}

// Clicking outside of the header closes the dropdown menu
const header = document.getElementById("header");
document.addEventListener("click", (e) => {
    if (!header.contains(e.target)) {
        closeHeaderDropdown();
    }
});