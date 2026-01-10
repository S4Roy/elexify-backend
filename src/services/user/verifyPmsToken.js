import axios from "axios";
import { envs, StatusError } from "../../config/index.js";

export const verifyPmsToken = async (token) => {
  const axiosConfig = {
    method: "GET",
    url: `${envs.pms_url}/user-validate`,
    headers: {
      Authorization: `Token ${token}`, // Use Token for authorization
      "Content-Type": "application/json", // Set content type if needed
    },
  };

  try {
    const response = await axios(axiosConfig);
    // Assuming a successful response indicates a valid token
    if (response.status === 200) {
      return response?.data; // Token is valid
    } else {
      return false; // Token is invalid
    }
  } catch (error) {
    console.error("Error verifying token:");
    // You can throw a custom error or return false based on your needs
    return false; // Token verification failed
  }
};
