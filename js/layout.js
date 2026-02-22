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

/* ANIMATE EATING THE ROOM CODE */
const mouth = document.getElementById("roomId");
const fang = document.getElementById("fang");
async function eatCode() {
    // skip animation for invalid room id
    const roomId = document.getElementById("roomId").value;
    if (!roomId) {
        return;
    }
    fang.classList.add("fang-animation");
    mouth.classList.add("mouth-animation");
    await new Promise(resolve => {
        fang.addEventListener('animationend', resolve, {once: true})
    });
    mouth.classList.remove("mouth-animation");
    fang.classList.remove("fang-animation");
}

/* CODE FOR DISPLAYING PLACEHOLDER TEXT */
// clears any newlines so that we can get the placeholder back
function togglePlaceholder(elem) {
    if (!elem.textContent.length) {
        elem.innerHTML = '';
    }
}