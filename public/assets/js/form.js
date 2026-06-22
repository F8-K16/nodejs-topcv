/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
const checkChangeForm = () => {
  const form = document.getElementById("editForm");
  const submitBtn = document.getElementById("submitBtn-edit");

  if (!form) return;

  const getSnapshot = () => {
    const data = new FormData(form);
    const obj = {};

    for (let [key, value] of data.entries()) {
      if (!obj[key]) obj[key] = [];
      obj[key].push(value);
    }

    Object.keys(obj).forEach((k) => obj[k].sort());

    return JSON.stringify(obj);
  };

  const initial = getSnapshot();

  form.addEventListener("input", () => {
    submitBtn.disabled = initial === getSnapshot();
  });
};

const previewLogo = () => {
  const input = document.getElementById("logoInput");
  const preview = document.getElementById("logoPreview");

  let objectUrl;
  input.addEventListener("input", () => {
    preview.src = input.value || "https://via.placeholder.com/100";
  });
};

const handleSelectDistrict = () => {
  const provinceSelect = document.getElementById("provinceSelect");
  const districtSelect = document.getElementById("districtSelect");

  provinceSelect.addEventListener("change", async () => {
    const provinceId = provinceSelect.value;

    // reset district
    districtSelect.innerHTML =
      '<option value="">-- Chọn Quận/Huyện --</option>';

    if (!provinceId) return;

    const res = await fetch(`/admin/districts?provinceId=${provinceId}`, {
      credentials: "include",
    });

    const districts = await res.json();

    districts.forEach((d) => {
      const option = document.createElement("option");
      option.value = d.id;
      option.textContent = d.name;
      districtSelect.appendChild(option);
    });
  });
};

const initEmployerSearch = () => {
  const searchInput = document.getElementById("search-employer");
  const items = document.querySelectorAll(".employer-item");

  if (!searchInput) return;

  searchInput.addEventListener("input", () => {
    const keyword = searchInput.value.toLowerCase();

    items.forEach((item) => {
      const input = item.querySelector("input");

      const name = input.dataset.name;
      const email = input.dataset.email;

      item.style.display =
        name.includes(keyword) || email.includes(keyword) ? "block" : "none";
    });
  });
};

document.addEventListener("DOMContentLoaded", () => {
  initEmployerSearch();
  previewLogo();
  handleSelectDistrict();
  checkChangeForm();
});
