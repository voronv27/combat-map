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

/* CODE FOR MAP CONTAINER IMAGE FITTING */
const mapBg = document.getElementById("mapBg");
const mapCtr = document.getElementById("mapCtr");
async function fitImg() {
    const imgRatio = mapBg.naturalWidth / mapBg.naturalHeight;
    const ctrRatio = mapCtr.clientWidth / mapCtr.clientHeight;
    
    // for a very small difference in ratio, don't change
    // (prevents some flickering)
    const eps = 0.01;
    if (Math.abs(imgRatio - ctrRatio) < eps) {
        return;
    }
    
    if (imgRatio > ctrRatio) {
        // scale by height, let width overflow
        mapBg.classList.remove("sm:w-full", "sm:h-auto");
        mapBg.classList.add("sm:h-full", "sm:w-auto")
    } else {
        // scale by width, let height overflow
        mapBg.classList.remove("sm:h-full", "sm:w-auto");
        mapBg.classList.add("sm:w-full", "sm:h-auto");
    }
}

// Upon new image upload, fit img to container
mapBg.onload = fitImg;

// Upon container resize (due to page resize), refit img
const resizeObserver = new ResizeObserver(fitImg);
resizeObserver.observe(mapCtr);