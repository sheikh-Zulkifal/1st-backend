import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiError} from "../utils/ApiError.js"
import {User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"


const generateAccessAndRefreshTokens = async(userId) =>{
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})

        return {accessToken, refreshToken}

    } catch (error) {
        throw new ApiError (500, "Something went wrong while generating refresh and access tokens")
    }
}


const registerUser = asyncHandler ( async (req, res) =>{
  // get user details from frontend
  // validation - not empty
  // check if user already exist : usename, email
  // chack images, avatar
  // upload them to cloudinary, avatar
  // create user obj - create entry in db
  // refresh password and token field from  res
  //check for user creation
  // return res
  
  const { fullName, username, email, password} = req.body
  console.log(email);


if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
) {
    throw new ApiError(400, "All fields are required")
}

const existedUser =  await User.findOne({
    $or: [{username},{email}]
})
if (existedUser) {
    throw new ApiError(409, "User with email or username already exists")
}
// console.log(req.files);

const avatarLocalPath = req.files?.avatar[0]?.path;
// const coverImageLocalPath = req.files?.coverImage[0]?.path;

let coverImageLocalPath;
if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0 ) {
    coverImageLocalPath = req.files.coverImage[0].path
}

if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar files is required")
}
const avatar = await uploadOnCloudinary(avatarLocalPath)
const coverImage = await uploadOnCloudinary(coverImageLocalPath)

if (!avatar) {
    throw new ApiError(400, "Avatar files is required")
}

const user = await User.create({
    fullName,
    password,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    username: username.toLowerCase()
})

const createdUser = await User.findById(user._id).select(
    "-password -refreshToken" 
)

if(!createdUser){
    throw new ApiError(500, "Something went wrong while registering user")
}

    return res.status(201).json(
        new ApiResponse(200, createdUser ,"User registered Successfully")
    )
})

const loginUser = asyncHandler(async(req, res)=>{
    // req body --> data
    // userName or email
    // find user
    // access and refresh Token
    // send cookee

    const {email, username ,password} = req.body

    if (!(username || email)) {
        throw new ApiError (400, "username or email is required")        
    }
    const user = await User.findOne({
        $or: [{username}, {email}]
    })
    if (!user) {
        throw new ApiError(404, "user does not exist")
    }
    const isPasswordValid = await user.isPasswordCorrect
    (password)
    if (!isPasswordValid) {
        throw new ApiError (401, "Invalid user credentials")        
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-refreshToken -password")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User logged IN Successfully"
            )
    )
})

const logoutUser = asyncHandler(async(req,res)=>{
    await User.findByIdAndUpdate(req.user._id,
        {
            $set: {
                refreshToken: undefined
            }                     
        },
        {
            new: true
        }
        )
        const options = {
            httpOnly: true,
            secure: true
        }
        
    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"))
})

const refreshAccessToken = asyncHandler(async(req, res )=>{
   const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    if (!incomingRefreshToken) {
        throw new ApiError(401,"Unauthorized Request")
    }
try {
    const decodedToken = jwt.verify( incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
    
    const user = await User.findById(decodedToken?._id)
    
    if (!user) {
        throw new ApiError(401, "Invalid Refreh token")
    }
    if (incomingRefreshToken !== user?.refreshToken) {
        throw new ApiError (401,"Refresh Token is Expired or used")    
    } 
     const options = {
        httpOnly: true,
        secure: true
     }
     
     const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
     return res
     .status(200)
     .cookie("accessToken", accessToken, options)
     .cookie("refreshToken", newRefreshToken, options)
     .json(
        new ApiResponse(200,
            {accessToken, refreshToken: newRefreshToken},
            "Access Token Refreshed"
            )
     )
} catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token")
}

})

const changeCurrentPassword = asyncHandler( async(req, res)=>{
    const {oldPassword, newPassword} = req.body
    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if (!isPasswordCorrect) {
        throw new ApiError(400, "Invalid Old Password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(new ApiResponse(200, "Password changed"))

})

const getCurrentUser = asyncHandler(async(req, res)=>{
    return res
    .status(200)
    .json(200, req.user, "User fetched successfully ")
})

const updateAccountDetails = asyncHandler(async(req,res)=>{
    const {fullName, email} = req.body
    if (!fullName || !email) {
        throw new ApiError(400, "All feilds are required")
    }
    const user = User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullName: fullName,
                email: email
            }
        },
        {new: true}
    ).select("-password")
    return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"))

})

const updateUserAvatar = asyncHandler(async(req, res) =>{
    const avatarLocalPath = req.file?.path
    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file missing")
    }
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    if (!avatar.url) {
        throw new ApiError(400, "Error while uploading on avatar")
    }
    const user = await User.findByIdAndUpdate(
        {
            $set: {
                avatar: avatar.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json( new ApiResponse(200, user, "Avatar image updated succeddfully"))
})
const uploadUserCoverImage = asyncHandler(async(req, res) =>{
    const coverImageLocalPath = req.file?.path
    if (!coverImageLocalPath) {
        throw new ApiError(400,"Cover image file missing")
    }
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if (!coverImage.url) {
        throw new ApiError(400,"Error while uploading cover image")
    }
    const user = User.findByIdAndUpdate(
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        {new: true}
    ).select("-password")
    return res
    .status(200)
    .json(new ApiResponse(200, user,"Cover image updated successfully"))
})


export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    uploadUserCoverImage
}